# FoconFlow

Controle de Produção e Rentabilidade por Projeto - MVP Core Flows

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
- **Acesso**: Página de apontamentos (`/time-entries`)

### Administrador
- **Email**: `admin@example.com`
- **Senha**: `password123`
- **Acesso**: Dashboard (`/dashboard`) e Relatório (`/report`)

## Fluxos Implementados

### Fluxo do Usuário Comum
1. Login com email/senha
2. Redirecionamento automático para `/time-entries`
3. Registrar novo apontamento (projeto, data, duração, descrição)
4. Visualizar histórico de apontamentos com status
5. Logout

### Fluxo do Administrador
1. Login com email/senha
2. Redirecionamento automático para `/dashboard`
3. Visualizar indicadores financeiros (receita, mão de obra, resultado, margem)
4. Aplicar filtros (projeto, profissional, período)
5. Visualizar tabela de profissionais com custos
6. Aprovar/rejeitar apontamentos pendentes
7. Visualizar detalhamento de apontamentos aprovados
8. Navegar para `/report` para gerar relatório
9. Imprimir/salvar em PDF
10. Logout

## Aprovação de Apontamentos

- Somente administradores podem aprovar/rejeitar
- Apontamentos pendentes aparecem em seção dedicada no dashboard
- Após aprovação, apontamentos entram nos cálculos financeiros
- Indicadores são atualizados após aprovação

## Dashboard Administrativo

**Indicadores Financeiros:**
- Receita: Valor total contratado
- Mão de Obra: Soma de (horas × custo-hora) dos apontamentos aprovados
- Resultado: Receita - Mão de Obra - Imposto (8%) - Custo Indireto
- Margem: (Resultado ÷ Receita) × 100%

**Filtros Funcionais:**
- Projeto
- Profissional
- Data inicial
- Data final

**Tabelas:**
- Resumo por Profissional (total de horas, custo-hora, custo total)
- Detalhamento de Apontamentos (projeto, profissional, data, duração, custo)

## Relatório para Impressão

- Exibe filtros aplicados
- Mostra indicadores financeiros
- Composição do resultado
- Resumo por projeto
- Estilos otimizados para impressão/PDF
- Botão "Imprimir / Salvar em PDF" visível na tela, oculto na impressão

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

Os arquivos `supabase/seed-auth.sql` e `supabase/seed.sql` contêm dados de demonstração:

- **Usuários de Auth**: Ana, Bruno, Carla (members) e Admin
- **Residencial Aurora**: R$ 120.000 de receita
- **Edifício Horizonte**: R$ 80.000 de receita
- **Custos-hora**: Ana (R$ 120/h), Bruno (R$ 150/h), Carla (R$ 100/h)
- **Apontamentos aprovados**: Pré-populados para demonstração

Os dados são idempotentes e executados automaticamente via `supabase db reset`.

## Limitações Atuais

- ❌ Gerenciamento de projetos (criar, editar, deletar)
- ❌ Gerenciamento de custos-hora (criar, editar, deletar)
- ❌ Edição de apontamentos após criação
- ❌ Atualização em tempo real (Supabase Realtime não implementado)
- ❌ Testes automatizados completos (estrutura criada, implementação pendente)
- ❌ Validação de migrations em banco real (pendente)

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

## Ativos de Marca

Os ativos de marca da Fócon Engenharia estão organizados em `public/brand/`:

- **focon-logo-horizontal.png** - Logo horizontal para superfícies claras
- **focon-logo-white.png** - Logo branca para fundos escuros
- **focon-colorida.jpeg** - Imagem quadrada para áreas compactas

Todos os ativos utilizam `object-fit: contain` para preservar proporção e incluem alt text `Fócon Engenharia` para acessibilidade.

Consulte `public/brand/README.md` para diretrizes de uso.

## Status de Implementação

✅ **Completo**
- Autenticação com Supabase Auth
- Redirecionamento por role (admin/member)
- Dashboard administrativo com indicadores financeiros
- Aprovação de apontamentos
- Relatório para impressão/PDF
- Estilos para impressão
- Seed reproduzível com usuários demo
- Lint e typecheck sem erros
- Build funcional

## Declaração de IA

Foi utilizada inteligência artificial como apoio na interpretação dos requisitos, planejamento, revisão de código, testes e documentação. Todo o código e todas as decisões foram revisados e permanecem sob responsabilidade do candidato.
