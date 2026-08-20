/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for three.js / @react-three/fiber — they ship ESM that Next.js
  // needs to transpile for the browser bundle.
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
};

module.exports = nextConfig;
