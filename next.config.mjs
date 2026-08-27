/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image de production Docker minimale (voir Dockerfile) : ne copie que le serveur
  // Next.js et ses dépendances tracées, pas l'intégralité de node_modules.
  output: "standalone",
};

export default nextConfig;
