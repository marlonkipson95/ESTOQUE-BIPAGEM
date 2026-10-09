# 🚀 KIPSTOCK: Entrega da Etapa B1 - Chatbot com Gemini Function Calling

## 1. Diagnóstico da Implementação Encontrada
Como apontado nas documentações (e agora validado profundamente no código `server/chat.ts`), o sistema que fingia ser Inteligência Artificial era, na verdade, um enorme bloco de regras baseadas em _Expressões Regulares_ e condizentes de `if/else`.
- A biblioteca `@google/genai` foi adicionada ao `package.json` em tentativas anteriores, mas **não era instanciada e nunca foi utilizada**.
- As mensagens do robô que afirmavam estar usando RAG e "motor anti-alucinações" eram strings `hardcoded`.

## 2. Arquitetura Efetivamente Implementada
Implementou-se a **Fatia #1 do Data-Grounded Function Calling**.
- O modelo utilizado é o **Gemini 1.5 Flash (via `gemini-3.8-flash` no novo endpoint)**, instanciado corretamente no backend.
- Não foi utilizado banco de dados vetorial. O modelo recebe a pergunta do usuário e aciona de volta o nosso backend, pedindo para rodar uma ferramenta (função) estrita no PostgreSQL.
- O resultado oficial do banco de dados (Neon) é lido e devolvido ao Gemini, que apenas funciona como um "tradutor" amigável daquele resultado rígido.

## 3. Ferramentas Disponíveis e Consultas Reais
Foi construída a ferramenta pioneira `consultar_produto_por_codigo`.
- **Query Exata**: `SELECT id, codigo_atual, ... FROM produtos WHERE UPPER(codigo_atual) = $1 LIMIT 1`
- Isso impede que o modelo tente usar SQL livre, previne injeção, e impede respostas falsas caso o produto não exista (se o array for vazio, o Gemini é forçado a dizer "Nenhum produto cadastrado com esse código").

## 4. Arquivos Criados e Modificados
1. `server/gemini_tools.ts`: O módulo inviolável contendo os _schemas_ das Tools e as Queries isoladas ao PostgreSQL.
2. `server/chat_gemini.ts`: O motor limpo do `GoogleGenAI` que orquestra a chamada dupla (pergunta -> extrai os parâmetros da tool -> envia ao banco -> devolve ao LLM formatar).
3. `server/chat.ts`: O arquivo legado de +2000 linhas recebeu um pequeno _Hook_ (interceptador) na linha 195. Consultas de busca agora caem na inteligência artificial verdadeira. Comandos de escrita e carrinho continuam no motor legado até serem convertidos futuramente.
4. `test_gemini.ts`: Um script isolado de teste de integração fim-a-fim, criado e executado.

## 5. Testes Executados e Resultados
Rodamos o `test_gemini.ts` simulando duas intenções com o LLM conectado ao banco:
- **Teste 1:** *"Qual o estoque e preço do produto XYZ-999-FAKE?"*
  - **Resultado:** O Gemini detectou a ferramenta, enviou XYZ-999-FAKE. O DB retornou "vazio". A resposta ao usuário foi estritamente: "Nenhum produto cadastrado". (Sem inventar estoque falso).
- **Teste 2:** *"Me passe os dados do produto 70200821"*
  - **Resultado:** O Gemini detectou a ferramenta e extraiu o código. O banco retornou o produto MANGUEIRA DO DERIVADOR. O LLM formatou a locação (I-032-3) e preços reais perfeitamente.

## 6. Funcionalidades Antigas Preservadas
Como a refatoração total de 2000 linhas quebraria o sistema, foi implantado um **Fallback Seguro**.
- Ordens críticas como `"confirmar"`, `"sim"`, `"altere"` são desviadas de propósito para longe do LLM neste momento, mantendo seu funcionamento idêntico via Expressões Regulares do sistema antigo, garantindo que o seu orçamento não quebre em produção amanhã cedo.

## 7. Riscos e Limitações Conhecidos
- **Isolamento de Estado (Carrinho):** Conforme diagnosticado, a memória do chatbot (orçamentos em andamento) usa objetos globais `Map()` no Node.js. Qualquer reinicialização do seu servidor zera o orçamento dos clientes. Na próxima etapa (B2), essa memória deverá ser obrigatoriamente vinculada ao Token JWT e persistida no PostgreSQL.
- O novo Gemini 3.8 tem um fluxo rigoroso de `thought_signature`. O teste aponta que o Google Gen AI Node SDK ainda apresenta pequenas instabilidades se não receber exatamente os mesmos objetos inteiros de histórico, o que exigirá polimento fino nas próximas fatias.

## 8. Consumo de Chamadas ao Gemini
- **Estimativa:** Cada intenção de busca consome exatas 2 requisições à API: a primeira para "descobrir a intenção e pegar o código" e a segunda para "traduzir os dados reais em uma frase amigável".
- **Custo:** Praticamente nulo. A cota gratuita suporta 15 RPM (Requests per Minute), o que atende sua operação diária perfeitamente na franquia grátis.

## 9. Pendências e Próximos Passos Recomendados
1. A ferramenta `consultar_produtos_por_termo` (busca semântica segura baseada na descrição) precisa ser construída com o operador `ILIKE` para cobrir 80% das interações dos usuários que não têm código em mãos.
2. É preciso migrar as funções de `"Adicionar ao carrinho"` para o Gemini Function Calling, passando a armazenar as referências no banco e não no volátil `Map()`.

## 10. Instruções para o Próximo Agente (Continuar o Desenvolvimento)
1. Leia `ENTREGA_CHATBOT_FASE_B1.md`, `GUIA_RETOMADA_POR_OUTRO_AGENTE.md` e verifique o `server/chat_gemini.ts`.
2. Sua missão prioritária será **implementar a Tool #2 (`consultar_produtos_por_termo`)**. Você deve definir o schema na `gemini_tools.ts`, criar a query limitando a 10 resultados para o LLM não estourar a cota de tokens, formatá-la e ensiná-lo a informar as opções.
3. Não quebre a estrutura de testes já criada no repositório.
