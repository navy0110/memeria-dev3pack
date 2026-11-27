const roundId = new URLSearchParams(location.search).get('bytearena');

export {};

if (roundId === null) {
  await import('./main');
} else {
  const { watchByteArena } = await import('./watch-bytearena');
  await watchByteArena(roundId);
}
