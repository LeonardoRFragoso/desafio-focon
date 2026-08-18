# FoconFlow

Controle de Produção e Rentabilidade por Projeto - MVP Completo

> **Contexto:** Este projeto foi desenvolvido como **desafio técnico de engenharia**. Não é um produto oficial da Fócon Engenharia e não há vínculo empregatício ou comercial. Os dados de demonstração são fictícios. Os ativos de marca da Fócon são utilizados apenas no contexto do desafio técnico submetido.

## Objetivo

Implementar o MVP funcional do FoconFlow com autenticação real, fluxos de usuário comum e administrativo, aprovação de apontamentos, dashboard financeiro e relatório para impressão/PDF.

## Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Forms**: React Hook Form + Zod
- **Backend**: Supabase (PostgreSQL + Auth)
- **Security**: Row Level Security (RLS)
- **Runtime**: Node.js 24
- **Code Quality**: ESLint + Prettier + TypeScript strict mode
- **CI/CD**: GitHub Actions com Supabase CLI v2
- **Deployment**: Vercel (Frontend)
- **Production**: https://desafio-focon.vercel.app

## Arquitetura

```
src/
  components/          # Reusable UI components
  features/
    auth/              # Authentication logic
    admin/             # Admin dashboard and approval
    time-entries/      # Time entry features
    professional/      # Professional dashboard
  hooks/               # Custom React hooks
    useFinancialData.ts       # Financial data fetching
    usePendingTimeEntries.ts  # Time entry approval
    usePersistedFilters.ts    # Filter persistence
  lib/
    supabase/
      client.ts        # Supabase client
      api.ts           # Centralized API queries
    errors.ts          # Error mapping and logging
    export.ts          # CSV/PDF export utilities
    financial-calculations.ts  # Pure financial logic
  pages/               # Page components
  routes/              # Routing configuration
  schemas/             # Zod validation schemas
  types/               # TypeScript types

supabase/
  migrations/          # SQL migrations
  tests/               # SQL/RLS tests
  config.toml          # Supabase configuration
```

## Modelo de Dados

### Tabelas

- **profiles**: Usuários com roles (admin, member)
- **projects**: Projetos com status e datas
- **project_financials**: Dados financeiros separados (receita, imposto, custo indireto)
- **hourly_rates**: Histórico de custos-hora por profissional
- **time_entries**: Apontamentos de horas com status de aprovação

### Segurança

- RLS ativado em todas as tabelas públicas
- Políticas específicas por role (admin vs member)
- Funções com SECURITY DEFINER para operações sensíveis
- Triggers para preservação de custo histórico
- Prevenção de manipulação de dados no banco

## Matriz de Permissões

### Membro Comum

**Pode:**
- Consultar próprio perfil
- Consultar informações não-financeiras de projetos
- Inserir apontamentos para si mesmo
- Consultar próprios apontamentos e seus status
- Visualizar detalhes completos de cada apontamento (modal)
- Acessar `/my-dashboard` com resumo de apontamentos (apenas aprovados contam para horas)
- Acessar `/time-entries` para registrar e visualizar histórico

**Não pode:**
- Editar ou deletar apontamentos (não há interface frontend)
- Ler perfis de outros usuários
- Ler custos-hora ou dados financeiros
- Ler apontamentos de outros
- Alterar próprio role
- Criar apontamento em nome de outro
- Escolher custo-hora aplicado
- Aprovar próprio apontamento
- Acessar `/dashboard` ou `/report`

### Administrador

**Pode:**
- Consultar todos os perfis
- Consultar todos os apontamentos
- Consultar dados financeiros
- Consultar histórico de custos
- Aprovar/rejeitar apontamentos
- Visualizar dashboard com indicadores
- Gerar relatório para impressão/PDF
- Executar funções administrativas

## Preservação de Custo Histórico

A estratégia implementa:

1. **Função `get_hourly_rate_for_date()`**: Encontra o custo-hora vigente para um profissional em uma data
2. **Trigger `trg_apply_hourly_rate_on_time_entry`**: Aplica automaticamente o custo-hora no momento da criação
3. **Trigger `trg_prevent_hourly_rate_modification`**: Impede modificação do `applied_hourly_rate` após criação
4. **Trigger `trg_check_hourly_rate_overlap`**: Previne períodos sobrepostos
5. **Trigger `trg_prevent_professional_id_manipulation`**: Garante que usuário só cria apontamentos para si
6. **Trigger `trg_prevent_approved_entry_creation`**: Garante que novos apontamentos começam como pendentes

## Fórmulas Financeiras

```
laborCost = soma(durationHours × appliedHourlyRate)
tax = contractedRevenue × taxRate
result = contractedRevenue - laborCost - tax - indirectCost
margin = contractedRevenue > 0 ? (result ÷ contractedRevenue × 100) : 0
```

Somente apontamentos `approved` entram nos cálculos.

## Instalação

### Pré-requisitos

- Node.js 24+
- npm
- Supabase CLI v2 (para desenvolvimento local)
- Docker (para Supabase local)

### Setup Local em 5 Comandos

```bash
# 1. Instalar dependências
npm ci

# 2. Iniciar Supabase local
supabase start

# 3. Aplicar migrations e seed
supabase db reset

# 4. Iniciar servidor de desenvolvimento
npm run dev

# 5. Abrir http://localhost:5173
```

## Configuração de Ambiente

### Arquivo `.env.local`

Copiar de `.env.example` e preencher com credenciais do Supabase local:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<sua-chave-anon-local>
```

**Importante:**
- `VITE_SUPABASE_URL`: Project URL (não é a senha do banco)
- `VITE_SUPABASE_ANON_KEY`: Publishable Key/anon key (não é a senha do banco)
- Nunca colocar senha do PostgreSQL em variáveis de ambiente do frontend
- Arquivo `.env.local` é ignorado pelo Git (segurança)

## Usuários de Demonstração

Após `supabase db reset`, os seguintes usuários estão disponíveis:

### Usuário Comum (Member)
- **Email**: `ana@example.com`
- **Senha**: `password123`
- **Acesso**: Painel pessoal (`/my-dashboard`) e página de apontamentos (`/time-entries`)

### Administrador
- **Email**: `admin@example.com`
- **Senha**: `password123`
- **Acesso**: Dashboard (`/dashboard`) e Relatório (`/report`)

## Fluxos Implementados

### Fluxo do Usuário Comum

1. Login com email/senha
2. Redirecionamento automático para `/my-dashboard`
3. Visualizar painel pessoal:
   - Horas aprovadas (apenas aprovados contam)
   - Quantidade de apontamentos aprovados, pendentes e rejeitados
   - Tabela com histórico de apontamentos (projeto, data, duração, status)
   - Sem visualização de custos ou dados financeiros
4. Navegar para `/time-entries` para registrar novo apontamento:
   - Selecionar projeto (com carregamento robusto e feedback de erro)
   - Informar data
   - Informar duração em minutos
   - Descrever o trabalho realizado
5. Visualizar histórico de apontamentos com status (Pendente, Aprovado, Rejeitado)
6. Clicar em um apontamento para visualizar detalhes completos em modal:
   - Projeto, data, duração, descrição, status
7. Validações em português para todos os campos
8. Logout

**Observações:**
- Não há edição ou exclusão de apontamentos pelo frontend
- O banco possui políticas RLS para proteger os registros
- Apontamentos pendentes não entram nos cálculos de horas aprovadas
- Membro nunca visualiza custos-hora ou dados financeiros

### Fluxo do Administrador

1. Login com email/senha
2. Redirecionamento automático para `/dashboard`
3. Visualizar indicadores financeiros:
   - Receita: Valor total contratado
   - Mão de Obra: Soma de (horas × custo-hora) dos apontamentos aprovados
   - Resultado: Receita - Mão de Obra - Imposto (8%) - Custo Indireto
   - Margem: (Resultado ÷ Receita) × 100%
4. Aplicar filtros (projeto, profissional, período)
5. Visualizar tabela de resumo por profissional (total de horas, custo-hora, custo total)
6. Visualizar detalhamento de apontamentos aprovados
7. Seção "Aprovação de Apontamentos":
   - Lista todos os apontamentos pendentes de todos os funcionários
   - Mostra profissional, projeto, data, duração, descrição e custo
   - Botões para Aprovar ou Rejeitar
   - Após ação, indicadores são atualizados automaticamente
8. Navegar para `/report` para gerar relatório:
   - Exibe filtros aplicados
   - Mostra indicadores financeiros
   - Composição do resultado
   - Resumo por projeto
   - Resumo por profissional
   - Botão "Imprimir / Salvar em PDF" visível na tela, oculto na impressão
   - Estilos otimizados para impressão/PDF
9. Logout

## Validações e Feedback

### Formulário de Apontamento

- **Projeto**: Validação obrigatória com carregamento robusto
  - Estado de carregamento: "Carregando projetos..."
  - Erro com botão "Tentar novamente"
  - Lista vazia: "Nenhum projeto ativo disponível para apontamento."
- **Data**: Validação obrigatória e de formato
- **Duração**: Validação obrigatória, mínimo 1 minuto, máximo 24 horas
- **Descrição**: Validação obrigatória, mínimo 10 caracteres, máximo 500
- Todas as mensagens em português
- Acessibilidade: `aria-invalid`, `aria-describedby`, `role="alert"`, `role="status"`

### Histórico de Apontamentos

- Loading com feedback visual e texto acessível
- Erro com botão "Tentar novamente"
- Estado vazio com orientação ao usuário
- Tabela com `<caption>` acessível e `scope="col"` nos cabeçalhos
- Linhas clicáveis para visualizar detalhes em modal

## Supabase Local

### Iniciar

```bash
supabase start
```

### Resetar banco

```bash
supabase db reset
```

### Executar testes SQL

```bash
supabase test db
```

### Parar

```bash
supabase stop
```

## Migrations

As migrations são versionadas em `supabase/migrations/` com timestamps únicos.

### Criar nova migration

```bash
supabase migration new <nome_da_migration>
```

### Aplicar localmente

```bash
supabase db reset
```

### Deploy remoto

O deploy automático ocorre via integração GitHub–Supabase quando há merge na branch `main`.

## Seed

Os arquivos `supabase/seed-auth.sql` e `supabase/seed.sql` contêm dados de demonstração:

- **Usuários de Auth**: Ana, Bruno, Carla (members) e Admin
- **Residencial Aurora**: R$ 120.000 de receita
- **Edifício Horizonte**: R$ 80.000 de receita
- **Custos-hora**: Ana (R$ 120/h), Bruno (R$ 150/h), Carla (R$ 100/h)
- **Apontamentos aprovados**: Pré-populados para demonstração

Os dados são idempotentes e executados automaticamente via `supabase db reset`.

## Testes

### Status

- **CI:** GitHub Actions — passando (3 runs consecutivas)
- **Testes unitários:** Vitest
- **E2E:** 7 specs Playwright (autenticação, rotas protegidas, CRUD de apontamentos, aprovação admin, lifecycle de projetos, navegação de meta semanal)
- **Testes de banco/RLS:** SQL suites via `supabase test db`

### Executar testes

```bash
npm run test
```

### Testes implementados

1. Cálculo financeiro do Residencial Aurora
2. Cálculo do Edifício Horizonte
3. Validação de duração inválida
4. Validação de descrição inválida
5. Bloqueio de rota administrativa
6. Membro impedido de consultar dados financeiros
7. Membro impedido de consultar apontamento de outra pessoa
8. Tentativa de adulterar custo-hora rejeitada

## Scripts

```bash
npm run dev          # Iniciar servidor de desenvolvimento
npm run build        # Build para produção
npm run lint         # Executar linter (com --fix)
npm run typecheck    # Verificar tipos TypeScript
npm run test         # Executar testes
npm run preview      # Preview do build
```

## Ativos de Marca

Os ativos de marca da Fócon Engenharia estão organizados em `public/brand/`:

- **focon-logo-horizontal.png** - Logo horizontal para superfícies claras
- **focon-logo-white.png** - Logo branca para fundos escuros
- **focon-colorida.jpeg** - Imagem quadrada para áreas compactas

Todos os ativos utilizam `object-fit: contain` para preservar proporção e incluem alt text `Fócon Engenharia` para acessibilidade.

## Status de Implementação

✅ **Completo - MVP Entregue**

### Funcionalidades Implementadas

- ✅ Autenticação com Supabase Auth
- ✅ Redirecionamento por role (admin/member)
- ✅ Painel do profissional (`/my-dashboard`) com resumo de apontamentos
- ✅ Dashboard administrativo com indicadores financeiros
- ✅ Filtros persistidos com localStorage (admin)
- ✅ Aprovação/rejeição de apontamentos com atualização automática
- ✅ Relatório para impressão/PDF com filtros
- ✅ Exportação de apontamentos em CSV e PDF
- ✅ Proteção contra formula injection em CSV
- ✅ Escape de HTML em exportações
- ✅ Estilos para impressão (@media print)
- ✅ Suporte a múltiplos custos-hora por profissional
- ✅ Formulário de apontamento com validações em português
- ✅ Carregamento robusto de projetos com feedback de erro
- ✅ Histórico de apontamentos com visualização de detalhes em modal
- ✅ Tratamento de erros com retry no dashboard
- ✅ Hooks customizados para lógica de dados (useFinancialData, usePendingTimeEntries)
- ✅ Serviço centralizado de API (lib/supabase/api.ts)
- ✅ Logging seguro sem exposição de credenciais
- ✅ Acessibilidade (ARIA, roles, live regions)
- ✅ Responsividade desktop e mobile
- ✅ Login premium com gradiente e animações
- ✅ Seed reproduzível com usuários demo
- ✅ Lint, typecheck e testes sem erros
- ✅ Build funcional
- ✅ Deploy em produção (Vercel)

## Retrospectiva

### Com Mais Tempo

- Implementação de edição/exclusão de apontamentos pendentes (com auditoria)
- Testes E2E com Playwright ou Cypress
- Observabilidade e monitoramento em produção
- Integração com webhooks para notificações
- Notificações em tempo real para aprovações/rejeições

### Maior Risco Tratado

**Autorização e Preservação Histórica do Custo-Hora**

O maior risco identificado foi garantir que:
1. O custo-hora aplicado a um apontamento nunca pudesse ser alterado após criação
2. Cada apontamento sempre refletisse o custo-hora vigente na data do trabalho
3. Mudanças futuras de custo-hora não afetassem apontamentos históricos

Tratamento implementado:
- Trigger `trg_apply_hourly_rate_on_time_entry` aplica automaticamente na criação
- Trigger `trg_prevent_hourly_rate_modification` bloqueia alterações
- RLS garante que membros não possam manipular o campo
- Testes validam o comportamento

### Primeira Melhoria para Produção

1. **Auditoria de Ações**: Log de todas as aprovações/rejeições com timestamp e usuário
2. **Monitoramento**: Alertas para anomalias (ex: rejeição em massa, aprovação fora do horário)
3. **Testes Ponta a Ponta**: Validação de fluxos completos em ambiente de staging

## Declaração de IA

Foi utilizada inteligência artificial (ChatGPT e Devin) como apoio na interpretação dos requisitos, planejamento, organização do desenvolvimento, revisão de código, testes e documentação. Todo o código, todas as decisões arquiteturais e todas as escolhas de implementação foram revisados e permanecem sob responsabilidade do candidato.
