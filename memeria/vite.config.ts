const arena = process.env.MEMERIA_ARENA_ORIGIN;
const proxy = arena ? { '/api/runs': { target: arena, changeOrigin: true } } : undefined;

export default {
  server: { proxy },
  preview: { proxy },
};
