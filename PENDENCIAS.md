# Pendências que dependem de você

Lista única de tudo o que o Claude **não consegue** fazer sozinho: acessos (Vercel, GitHub, Neon, Google),
decisões de negócio ou jurídicas e verificações que exigem um login de teste. Marque `[x]` quando fizer e
avise o Claude, que então cuida do que vem depois (teste, ajuste de código, verificação no site).

Atualizado em 2026-10-11. O que já foi entregue está no histórico do Git; aqui só entra o que está em aberto.

---

## 1. Segurança e configuração (fazer primeiro)

- [ ] **Trocar o `BETTER_AUTH_SECRET` na Vercel.** O atual é fraco (7 caracteres) e aparece como aviso em todo build.
  1. Gere um novo: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  2. Vercel → Project → Settings → Environment Variables → `BETTER_AUTH_SECRET` (Production, e Preview/Development se
     tiverem o mesmo valor fraco) → salve e faça **redeploy**. Todo mundo é deslogado, é esperado.
  3. Avise o Claude: ele confere login/logout e acrescenta um aviso no código para segredo com menos de 32 caracteres.
- [ ] **Criar o segredo `CRON_SECRET` no GitHub** (Settings → Secrets and variables → Actions), com o **mesmo valor** do
  `CRON_SECRET` da Vercel. Sem isso, a rotina de 15 em 15 minutos (reembolsos por prazo, liberações automáticas e a
  conferência do dinheiro) só roda uma vez por dia, e cada execução do workflow "SLA sweep" fica vermelha (com e-mail do GitHub) até o segredo existir.
- [ ] **Definir `DELIVERY_ENCRYPTION_KEY` na Vercel** (32 bytes em base64, mesmo gerador acima) e fazer redeploy. Depois peça
  ao Claude para criptografar os dados de entrega já gravados (`scripts/encrypt-delivery-payloads.mjs`, primeiro em
  simulação). **Guarde a chave em local seguro**: perdê-la torna os dados criptografados ilegíveis.
- [ ] **Fixar a loja de Blob do app (`ELLOWIN_BLOB_HOST`) na Vercel.** Hoje o site aceita, como foto de anúncio, avatar ou banner,
  um arquivo de QUALQUER loja do Vercel Blob (o filtro olha só o sufixo `.public.blob.vercel-storage.com` e o seu id no caminho), então
  alguém com uma loja de Blob própria foge da conferência de tipo/tamanho/limite dos uploads e pode trocar a imagem depois. Para fechar:
  1. Abra qualquer foto de anúncio no site (clique direito > copiar endereço da imagem) e pegue só o host, por exemplo
     `abc123xyz.public.blob.vercel-storage.com`.
  2. Vercel > Settings > Environment Variables > `ELLOWIN_BLOB_HOST` = esse host (Production), e faça redeploy (o `next.config` lê no build).
  3. Avise o Claude: ele confere que as fotos continuam aparecendo. A variável fecha também o curinga do otimizador de imagens e da CSP.
- [ ] **Configurar o Sentry (monitoramento de erros):** criar um projeto (plataforma Next.js), colocar
  `NEXT_PUBLIC_SENTRY_DSN` na Vercel e fazer **redeploy** (a variável é lida no build). Opcional, para erros legíveis:
  `SENTRY_ORG`, `SENTRY_PROJECT` e `SENTRY_AUTH_TOKEN`.
- [ ] **Confirmar o envio de e-mail em produção:** `RESEND_API_KEY` e `ELLOWIN_EMAIL_FROM` na Vercel e o domínio remetente
  verificado no Resend. Sem isso, os e-mails de pedido, disputa e o alerta da conferência falham em silêncio.
- [x] **Login com Google — FEITO e testado (2026-10-12):** cliente OAuth "Ellowin (site)" no Google Cloud (projeto "My First
  Project"), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` na Vercel (Produção), Branding preenchido (início, `/termos` como
  privacidade e termos, domínio `ellowin.com.br`), app **Em produção** e login de teste com conta Google funcionou. Sobram só:
  (a) trocar o e-mail de suporte da tela de consentimento (hoje é o e-mail pessoal) em Google Auth Platform → Branding quando
  houver um e-mail do domínio; (b) guardar a chave secreta em local seguro (o Google não a mostra de novo; se perder, crie outra
  no mesmo cliente); (c) trocar o `BETTER_AUTH_SECRET` (item acima), que derruba as sessões atuais.

## 2. Dados de demonstração no banco de produção

- [ ] **Corrigir as vendas inflamadas dos anúncios de exemplo 1 a 6.** O Claude foi impedido de escrever no banco de
  produção, então rode no console da Neon (ou libere uma regra de permissão para ele rodar):

  ```sql
  BEGIN;
  UPDATE "product" p
     SET "salesCount" = (SELECT count(*)::int FROM "order" o
                          WHERE o."productId" = p."id" AND o."status" = 'concluido')
   WHERE p."id" BETWEEN 1 AND 6;
  SELECT "id", "salesCount" FROM "product" WHERE "id" BETWEEN 1 AND 6 ORDER BY "id";
  COMMIT;
  ```

  Resultado esperado para os ids 1 a 6: **2, 0, 2, 1, 2, 0** (hoje: 129, 64, 941, 1523, 88, 42).
- [ ] **Duas contas de exemplo (`@ellowin.dev`) compartilham o mesmo CPF.** Isso impede criar um índice único de CPF no
  banco (hoje a unicidade só é conferida pelo app, e uma corrida poderia duplicar). Escolha qual conta alterar ou
  apagar (uma delas é dona dos anúncios de exemplo ativos). Depois o Claude cria o índice.

## 3. Decisões suas (negócio e jurídico)

- [x] **Página pública da loja de uma conta excluída — feito (2026-10-17):** depois da exclusão (LGPD), `/loja/<nome>` e os anúncios
  pausados da conta passam a dar 404 e o avatar e o banner são apagados do Blob. As linhas continuam no banco (retenção legal); só
  deixam de ser públicas. Se a retenção exigir manter algo público, é só dizer.
- [x] **Moderação e os dados de entrega — resolvido por padrão (2026-10-12):** moderador e administrador (quando não são
  parte do pedido) só leem os "Dados da entrega" decifrados **enquanto a disputa do pedido está aberta** (`aberta` ou
  `em_analise`); sem disputa ou com a disputa encerrada, veem o pedido mas não as credenciais. Comprador e vendedor leem
  sempre. É a opção de menor acesso que ainda permite julgar. Se preferir outra (manter tudo aberto à moderação, ou
  esconder sempre), é só dizer: é uma constante e um teste.
- [x] **Texto do código de telefone — ajustado (2026-10-12):** o e-mail e o aviso na tela agora dizem "Ainda não enviamos
  códigos por SMS, por isso ele chega por email" (antes citavam "ambiente de testes", e isso chegava a clientes reais).
  Quando houver SMS de verdade (item de KYC/SMS), o canal e o texto mudam juntos; se quiser outra redação, é só dizer.
- [ ] **Conflito de interesse na moderação de denúncias** (mudança já publicada em `be45763`): moderador que é parte
  do caso (quem denunciou, o denunciado ou o dono do anúncio) não assume nem decide a denúncia, a mesma regra que
  as disputas já tinham. Confirme que é isso mesmo que você quer.
- [ ] **Nome da proteção ao comprador** (como TradeShield ou GamerProtect nos concorrentes). Verifique se não há marca
  registrada. Hoje o bloco na página do anúncio é "Como protegemos sua compra", sem nome.
- [x] **Janela de conferência contada da entrega** (feito em 2026-10-17): a liberação automática ao vendedor é **7 dias
  depois da entrega**, e o código, a central de ajuda e a página dos jogos já dizem isso. Pedidos entregues antes dessa
  data mantêm o prazo antigo (7 dias da compra). Os `/termos` foram ajustados (próximo item).
- [ ] **Revisar o texto jurídico de `/termos` com um advogado.** Em 2026-10-18 o Claude, a seu pedido, corrigiu os três
  trechos que contradiziam o sistema (liberação automática: 7 dias após a entrega; cadastro de vendedor em etapas, sem
  "níveis com limites"; "central de segurança" trocada por "canal de contato da Central de ajuda") e incluiu que a moderação vê
  os dados de entrega durante uma disputa aberta. É correção de fato, não revisão jurídica. Atenção: o texto diz que os dados de
  entrega "ficam cifrados no banco", o que só é verdade depois de definir `DELIVERY_ENCRYPTION_KEY` (item acima).
- [ ] **Canal de contato e horário do suporte.** Defina o e-mail (e o horário, sem prometer 24/7 sem equipe) e coloque
  `ELLOWIN_SUPPORT_EMAIL` (e, se quiser, `ELLOWIN_SUPPORT_HOURS`, por exemplo "Segunda a sexta, das 9h às 18h") na
  Vercel. Não precisa de redeploy. Até lá a Central de ajuda diz que ainda não há canal direto.
- [ ] **Plano da Neon e a primeira requisição lenta.** A primeira visita depois de um período parado levou cerca de
  5,7 s (o banco "dorme"). Confirme a cota de horas de computação do seu plano antes de qualquer ping de
  manutenção. **Não** trocar `.github/workflows/sla-sweep.yml` para rodar a cada 5 minutos sem essa confirmação:
  esgotar a cota suspende o banco e derruba o site.

## 4. Para destravar verificações que o Claude não consegue fazer sozinho

- [ ] **Um login de teste de comprador e outro de vendedor** (contas de teste, não as de verdade). Com elas o Claude
  verifica no site publicado o que hoje só está coberto por testes automáticos: o fluxo de compra (diálogos e avisos),
  criar um anúncio com rank e região, o painel do vendedor e a carteira.
- [ ] **Verificação de identidade de verdade (KYC) e SMS de verdade.** Hoje o CPF só tem o dígito verificador conferido, o
  "documento" do vendedor são nomes de arquivo e o código do telefone chega por e-mail. Para ser real precisa de um
  provedor (decisão sua ou do grupo).
- [ ] **Gateway de pagamento** (adiado por você). Quando for a hora, o Claude precisa antes de: exigir e-mail confirmado
  no depósito (hoje o depósito de demonstração só exige estar logado) e trocar a mensagem do saque "Saldo disponível
  insuficiente", que hoje aparece também para falhas que não são de saldo.

## 5. Limpeza e ajustes de repositório

- [ ] Apagar à mão a pasta vazia `.claude/worktrees/elated-goldstine-196bb8` (o OneDrive a mantém travada).
- [ ] Opcional: ligar a proteção de branch no GitHub exigindo a CI verde (Settings → Branches → Branch protection rules).

---

## Coisas para lembrar no futuro (não são ações agora)

- Hoje só existem os status de vendedor "em andamento" e "aprovado". **Se um dia houver suspensão de vendedor**, é preciso
  travar `saveStoreStep` e `savePayoutStep`, que hoje devolveriam a conta a "em andamento" e reaprovariam.
- Os testes de login usam um Better Auth simulado: a criptografia real de senha, os cookies de sessão e a ligação com o
  Google só se confirmam com o login de teste acima.
- O banco de teste em memória tem uma única conexão, então a corrida entre duas transações simultâneas não é testada.
