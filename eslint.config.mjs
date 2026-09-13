import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  {
    ignores: [".claude/**", "public/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Painel de dev que manipula nós do DOM guardados em estado (arrastar
    // enquadramento, editar texto no lugar) — incompatível por natureza com
    // as regras de pureza do React Compiler. Nunca renderiza em produção
    // (gate em app/layout.tsx).
    files: ["components/dev/design-lab.tsx"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]

export default eslintConfig
