// Crea el token MMRIA en devnet: mint con 6 decimales, supply fijo de 100.000.000 y las dos
// authorities (mint y freeze) revocadas. Después de correr esto nadie puede imprimir más ni congelar cuentas.
//
//   pnpm token:create          # crea las claves de prueba en .keys/, pide airdrop y crea el token
//
// Las claves van en .keys/ (fuera de git). Es una wallet de PRUEBA: en mainnet la tesorería es un multisig.
// Si el script se corta a la mitad se puede volver a correr: retoma donde quedó.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  airdropFactory,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
  AuthorityType,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintToCheckedInstruction,
  getSetAuthorityInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';

const DECIMALS = 6;
const SUPPLY = 100_000_000n; // unidades enteras de MMRIA
const RAW_SUPPLY = SUPPLY * 10n ** BigInt(DECIMALS);
const MINT_SPACE = 82n; // tamaño de una cuenta Mint del token program

const RPC_URL = 'https://api.devnet.solana.com';
const WSS_URL = 'wss://api.devnet.solana.com';
const KEYS = join(import.meta.dirname, '..', '.keys');

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
const airdrop = airdropFactory({ rpc, rpcSubscriptions });

/** Lee un keypair guardado (64 bytes) o crea uno nuevo y lo guarda. */
async function loadOrCreateKey(file: string): Promise<KeyPairSigner> {
  const path = join(KEYS, file);
  if (existsSync(path)) {
    return createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, 'utf8')) as number[]));
  }
  // extractable: hace falta para poder guardar la clave; es una clave de prueba de devnet
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).slice(-32);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const bytes = new Uint8Array([...priv, ...pub]);
  writeFileSync(path, JSON.stringify(Array.from(bytes)), { mode: 0o600 });
  return createKeyPairSignerFromBytes(bytes);
}

async function send(payer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  await sendAndConfirm(tx as Parameters<typeof sendAndConfirm>[0], { commitment: 'confirmed' });
  return getSignatureFromTransaction(tx);
}

async function main(): Promise<void> {
  mkdirSync(KEYS, { recursive: true });
  const payer = await loadOrCreateKey('payer.json');
  const mint = await loadOrCreateKey('mint.json');
  console.log('Treasury (devnet):', payer.address);
  console.log('Mint MMRIA:       ', mint.address);

  // 1) Fondos para las comisiones
  const balance = (await rpc.getBalance(payer.address).send()).value;
  if (balance < 20_000_000n) {
    console.log('Pidiendo 1 SOL de devnet…');
    try {
      await airdrop({ commitment: 'confirmed', recipientAddress: payer.address, lamports: lamports(1_000_000_000n) });
    } catch (e) {
      console.error(`\nEl airdrop falló (el faucet público de devnet tiene límite). Mandá SOL de devnet a\n  ${payer.address}\ndesde https://faucet.solana.com y volvé a correr el script.\n`, e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  // 2) Crear la mint (sin freeze authority) si todavía no existe
  const existing = (await rpc.getAccountInfo(mint.address, { encoding: 'base64' }).send()).value;
  if (!existing) {
    const rent = await rpc.getMinimumBalanceForRentExemption(MINT_SPACE).send();
    const sig = await send(payer, [
      getCreateAccountInstruction({ payer, newAccount: mint, lamports: rent, space: MINT_SPACE, programAddress: TOKEN_PROGRAM_ADDRESS }),
      getInitializeMint2Instruction({ mint: mint.address, decimals: DECIMALS, mintAuthority: payer.address, freezeAuthority: null }),
    ]);
    console.log('Mint creada:', sig);
  } else {
    console.log('La mint ya existe, sigo.');
  }

  // 3) Mintear todo el supply a la tesorería y revocar la mint authority (si no se revocó ya)
  const [ata] = await findAssociatedTokenPda({ owner: payer.address, mint: mint.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const supply = (await rpc.getTokenSupply(mint.address).send().catch(() => null))?.value.amount;
  if (supply === undefined || BigInt(supply) === 0n) {
    const sig = await send(payer, [
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer, owner: payer.address, mint: mint.address }),
      getMintToCheckedInstruction({ mint: mint.address, token: ata, mintAuthority: payer, amount: RAW_SUPPLY, decimals: DECIMALS }),
      getSetAuthorityInstruction({ owned: mint.address, owner: payer, authorityType: AuthorityType.MintTokens, newAuthority: null }),
    ]);
    console.log(`Minteados ${SUPPLY.toLocaleString('en-US')} MMRIA y mint authority revocada:`, sig);
  } else {
    console.log('El supply ya estaba minteado:', supply);
  }

  // 4) Verificar el estado final
  const info = (await rpc.getAccountInfo(mint.address, { encoding: 'jsonParsed' }).send()).value?.data as
    | { parsed?: { info?: { mintAuthority: string | null; freezeAuthority: string | null; supply: string; decimals: number } } }
    | undefined;
  const m = info?.parsed?.info;
  if (!m) throw new Error('No pude leer la mint después de crearla.');
  console.log('\nEstado final de la mint');
  console.log('  supply:         ', m.supply, `(${BigInt(m.supply) / 10n ** BigInt(m.decimals)} MMRIA)`);
  console.log('  decimals:       ', m.decimals);
  console.log('  mintAuthority:  ', m.mintAuthority ?? 'revocada ✔');
  console.log('  freezeAuthority:', m.freezeAuthority ?? 'revocada ✔');
  console.log('  explorer:        https://explorer.solana.com/address/' + mint.address + '?cluster=devnet');

  writeFileSync(join(KEYS, 'mmria.json'), JSON.stringify({ cluster: 'devnet', mint: mint.address, treasury: payer.address, ata }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
