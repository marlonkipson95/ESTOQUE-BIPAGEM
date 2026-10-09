# Diretrizes para o Chat RAG Data-Grounded (Fase Futura)

Este documento estabelece as regras arquiteturais e limites de segurança para a futura implementação do RAG/IA no Assistente Kipstock, conforme os requisitos de prevenção de alucinação.

## 1. Proteção via Autenticação (Fase A)
Antes de o Chat evoluir para o uso de LLM com chamadas de função (Function Calling), a infraestrutura base (Fase A) garantirá que:
- O endpoint `/api/chat` exija um **Token JWT Válido**.
- Qualquer ferramenta (Tool) invocada pelo modelo (ex: `consultarEstoque`) fará chamadas internas que respeitam o escopo do usuário autenticado no token.
- O modelo não terá acesso direto a strings de conexão do banco de dados, atuando estritamente sobre APIs encapsuladas e protegidas.

## 2. Princípio Data-Grounded
Toda resposta gerada sobre inventário, orçamentos e produtos será estritamente baseada no retorno das APIs internas do Postgres. 
- **Sem preenchimento:** O LLM será instruído via System Prompt a **nunca** preencher lacunas de quantidade, preço ou compatibilidade usando seu conhecimento prévio.
- **Rastreabilidade:** A resposta deverá citar o código do produto e a origem (ex: "Segundo o banco de dados...").
- **Fallback Estrito:** Se a API não retornar o dado, a IA responderá exclusivamente: "Não encontrei dados suficientes para confirmar."

## 3. Escopo de Ferramentas Controladas
O agente possuirá apenas contratos de leitura limitados (Read-Only) em sua primeira iteração:
- `buscarProdutoPorCodigo(codigo)`
- `consultarEstoque(produtoId)`
- `consultarLocalizacaoProduto(produtoId)`

Operações de alteração exigirão confirmação humana explícita fora do contexto autônomo do modelo.

## 4. Testes Anti-Alucinação
A suíte de testes validará:
1. Comportamento perante códigos inexistentes (não inventar similar).
2. Comportamento sem rede (offline).
3. Respostas quando campos vitais (ex: `preco`) estão nulos no banco.
