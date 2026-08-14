# FoconFlow

Controle de Produção e Rentabilidade por Projeto - MVP Foundation

## Objetivo

Desenvolver o recorte "Controle de Produção e Rentabilidade por Projeto" da plataforma conceitual FoconFlow, com suporte para dois perfis: administrador e membro comum.

## Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form + Zod
- **Backend**: Supabase (PostgreSQL + Auth)
- **Security**: Row Level Security (RLS)
- **Testing**: Vitest + Testing Library
- **Code Quality**: ESLint + Prettier + TypeScript strict mode
- **CI/CD**: GitHub Actions

## Arquitetura

```
src/
  app/                 # Application configuration
  components/          # Reusable UI components
  features/
    auth/              # Authentication logic
    dashboard/         # Dashboard features
    projects/          # Project management
    time-entries/      # Time entry features
  hooks/               # Custom React hooks
  lib/
    supabase/          # Supabase client
    financial-calculations.ts  # Pure financial logic
  pages/               # Page components
  routes/              # Routing configuration
  schemas/             # Zod validation schemas
  services/            # API services
  styles/              # Global styles
  test/                # Test utilities
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
- Consultar próprios apontamentos
- Editar/deletar próprios apontamentos pendentes

**Não pode:**
- Ler perfis de outros usuários
- Ler custos-hora
- Ler dados financeiros
- Ler apontamentos de outros
- Alterar próprio role
- Criar apontamento em nome de outro
- Escolher custo-hora aplicado
- Aprovar próprio apontamento

### Administrador

**Pode:**
- Consultar todos os perfis
- Consultar todos os apontamentos
- Consultar dados financeiros
- Consultar histórico de custos
- Aprovar/rejeitar apontamentos
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

- Node.js 20+
- npm ou yarn
- Supabase CLI (para desenvolvimento local)
- Docker (para Supabase local)

### Setup Local

```bash
# Clonar repositório
git clone https://github.com/LeonardoRFragoso/desafio-focon.git
cd desafio-focon

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env.local
# Editar .env.local com suas credenciais Supabase

# Iniciar servidor de desenvolvimento
npm run dev
```

## Variáveis de Ambiente

Criar arquivo `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Nunca commitar**: `.env`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, senhas ou tokens pessoais.

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

O deploy automático ocorre via integração GitHub–Supabase quando há merge na branch `main`. Não execute `supabase db push` manualmente neste ciclo.

## Seed

O arquivo `supabase/migrations/20240814090400_seed_demo_data.sql` contém dados de demonstração:

- **Residencial Aurora**: R$ 120.000 de receita
- **Edifício Horizonte**: R$ 80.000 de receita

Os dados são idempotentes e não sobrescrevem usuários reais.

## Testes

### Executar testes

```bash
npm run test
```

### Cobertura

```bash
npm run test:coverage
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
npm run test:coverage # Testes com cobertura
npm run preview      # Preview do build
```

## Integração GitHub–Supabase

O repositório está integrado com Supabase para deploy automático:

- **Branch de produção**: `main`
- **Comportamento**: Merge na `main` dispara aplicação de migrations no banco remoto
- **Aviso**: Não faça merge neste ciclo sem auditoria humana

## Limitações (MVP Foundation)

- Dashboard completo não implementado
- Relatório para PDF não implementado
- Responsividade em progresso
- Acessibilidade em progresso
- Testes de RLS requerem Supabase local rodando

## Roadmap (Macrofase 2)

- Login completo e fluxo de autenticação
- Formulário de apontamento funcional
- Listagem de apontamentos
- Aprovação administrativa
- Dashboard com indicadores
- Filtros avançados
- Tabela por profissional
- Estados da interface

## Roadmap (Macrofase 3)

- Relatório para impressão/PDF
- Responsividade completa
- Acessibilidade (WCAG 2.1)
- Testes finais
- Revisão de segurança
- Deploy em produção
- Vídeo demonstrativo
- Retrospectiva

## Declaração de IA

Foi utilizada inteligência artificial como apoio na interpretação dos requisitos, planejamento, revisão de código, testes e documentação. Todo o código e todas as decisões foram revisados e permanecem sob responsabilidade do candidato.
