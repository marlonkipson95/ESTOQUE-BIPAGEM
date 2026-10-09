# Plano de Integridade e Sincronização (Offline-First)

## 1. Mapeamento Atual (Como funciona hoje)
1. **Ponto da Verdade (Cliente):** O React confia no `storageService.ts` (LocalStorage) imediatamente para renderização rápida.
2. **Sincronização:** `storageService.syncWithBackend()` é ativado em background e sobrescreve as linhas no PostgreSQL baseado num comparativo fraco. "Last Write Wins".

## 2. Abordagem de Correção Proposta (Fase B)
- **Fila de Sincronização (Sync Queue):** Implementar um array `pending_sync_operations` no LocalStorage do usuário.
- **Timestamp e Idempotência:** Toda bipagem (movimentação) gerará um UUID e um Timestamp no dispositivo local. O Backend irá processar movimentações com base no ID da Operação (evitando lançar o mesmo movimento duas vezes).
- **Sem conflitos destrutivos:** O inventário total (soma do estoque) será derivado das movimentações de estoque, não por um mero "update produtos set quantidade = 10", pois isso causa sobrescrita se o usuário B adicionar +2 enquanto o A estava sem internet e depois sobreescrever com 10.
