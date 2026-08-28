/** @type {import('next').NextConfig} */

// A production build and `next dev` share .next and clobber each other's
// cache, so `npm run build` sets NEXT_DIST_DIR to build somewhere else.
//
// Vercel has no buildCommand in vercel.json, so it runs that same
// `npm run build` — and its deployments must keep emitting the default
// .next. VERCEL is set in every Vercel build environment, so the override
// is ignored there and only ever applies locally.
const distDir = process.env.VERCEL
  ? ".next"
  : process.env.NEXT_DIST_DIR || ".next";

const nextConfig = {
  distDir,
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
  },
};

export default nextConfig;
