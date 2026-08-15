/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // Otimização ligada: o Next serve AVIF/WebP no tamanho certo para cada tela,
    // reduzindo o peso das fotos dos anúncios sem esforço do vendedor.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
}

export default nextConfig
