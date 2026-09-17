import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Trash2, Sparkles, ChevronDown } from 'lucide-react';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

/**
 * Renderizador de mensagens com suporte a tabelas Markdown com rolagem horizontal e formatação
 */
const FormattedMessage: React.FC<{ text: string }> = ({ text }) => {
  // Dividir linhas para identificar tabelas markdown
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentTableLines: string[] = [];

  const flushTable = (key: number) => {
    if (currentTableLines.length === 0) return;
    const headerLine = currentTableLines[0];
    const dataLines = currentTableLines.slice(2); // Pula linha separadora | :--- |

    const parseCells = (line: string) => 
      line.split('|').slice(1, -1).map(c => c.trim());

    const headers = parseCells(headerLine);

    elements.push(
      <div key={`table-${key}`} className="my-2.5 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-950/60 shadow-sm max-w-full">
        <table className="w-full text-left text-[11px] sm:text-xs min-w-[320px]">
          <thead className="bg-slate-800/80 text-slate-300 font-semibold border-b border-slate-700/80">
            <tr>
              {headers.map((h, hIdx) => (
                <th key={hIdx} className="px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {dataLines.map((row, rIdx) => {
              const cells = parseCells(row);
              return (
                <tr key={rIdx} className="hover:bg-slate-800/30 transition">
                  {cells.map((c, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                      {formatInlineText(c)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    currentTableLines = [];
  };

  const formatInlineText = (txt: string): React.ReactNode => {
    // Regex para identificar **negrito** e `código`
    const parts = txt.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, idx) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={idx} className="font-bold text-white">{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        return (
          <code key={idx} className="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[11px] border border-slate-700/60">
            {p.slice(1, -1)}
          </code>
        );
      }
      return p;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      currentTableLines.push(trimmed);
    } else {
      if (currentTableLines.length > 0) {
        flushTable(idx);
      }
      if (trimmed === '') {
        elements.push(<div key={`br-${idx}`} className="h-2" />);
      } else if (trimmed.startsWith('•') || trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const bulletText = trimmed.replace(/^[•\*\-]\s*/, '');
        elements.push(
          <div key={`bullet-${idx}`} className="flex items-start gap-1.5 my-0.5 text-xs sm:text-sm">
            <span className="text-indigo-400 mt-1 font-bold leading-none">•</span>
            <span className="flex-1">{formatInlineText(bulletText)}</span>
          </div>
        );
      } else if (trimmed.startsWith('---')) {
        elements.push(<hr key={`hr-${idx}`} className="my-2 border-slate-700/60" />);
      } else {
        elements.push(
          <p key={`p-${idx}`} className="text-xs sm:text-sm my-0.5 leading-relaxed">
            {formatInlineText(trimmed)}
          </p>
        );
      }
    }
  });

  if (currentTableLines.length > 0) {
    flushTable(lines.length);
  }

  return <div className="space-y-0.5">{elements}</div>;
};

export const ChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    text: 'Olá! Sou o Assistente Inteligente de Estoque e Orçamentos da Otto Diesel. Como posso ajudar hoje?',
    sender: 'bot',
    timestamp: new Date()
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ID persistente de sessão durante a navegação
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(7));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: input.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'http://localhost:3000/api'
        : '/api';

      const res = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.text, sessionId })
      });

      const data = await res.json();
      
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: data.response || data.error || 'Erro ao processar a resposta.',
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Desculpe, não consegui conectar ao servidor do assistente no momento.',
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Botão Flutuante - Posicionado perfeitamente no Mobile (bottom-20) para não colidir com o menu inferior */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 h-14 w-14 bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-full shadow-2xl shadow-indigo-600/50 flex items-center justify-center transition-all z-50 transform hover:scale-105 active:scale-95 border-2 border-white/20"
          title="Abrir Assistente OttoDiesel"
          aria-label="Assistente OttoDiesel"
        >
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900"></span>
          </span>
          <Bot size={26} />
        </button>
      )}

      {/* Janela de Chat - No celular abre responsiva/tela cheia confortável; no desktop abre em card elegante */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 w-full sm:w-[480px] sm:max-w-[calc(100vw-32px)] h-full sm:h-[660px] sm:max-h-[88vh] bg-slate-900 text-slate-100 sm:rounded-2xl shadow-2xl flex flex-col z-50 border-0 sm:border border-slate-800 overflow-hidden animate-in slide-in-from-bottom-5">
          
          {/* Header Superior */}
          <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-700 text-white px-4 py-3.5 flex justify-between items-center shrink-0 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20 shadow-inner">
                <Bot size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm tracking-tight leading-tight flex items-center gap-1.5">
                  Assistente OttoDiesel
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 font-semibold px-1.5 py-0.2 rounded border border-emerald-400/40">
                    Online
                  </span>
                </h3>
                <p className="text-[10px] text-indigo-200">
                  Estoque • Orçamentos • Listas Rápidas
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button 
                onClick={() => setMessages([{
                  id: 'welcome',
                  text: 'Olá! Sou o Assistente Inteligente de Estoque e Orçamentos da Otto Diesel. Como posso ajudar hoje?',
                  sender: 'bot',
                  timestamp: new Date()
                }])} 
                className="text-indigo-200 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors" 
                title="Limpar conversa"
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-indigo-200 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors" 
                title="Fechar assistente"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Área de Mensagens com rolagem suave */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-950/80 overscroll-contain">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  msg.sender === 'user' 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'bg-slate-800 text-indigo-400 border border-slate-700'
                }`}>
                  {msg.sender === 'user' ? <User size={14} /> : <Bot size={15} />}
                </div>

                <div className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.sender === 'user' ? (
                    <p className="text-xs sm:text-sm whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <FormattedMessage text={msg.text} />
                  )}
                  <span className={`text-[9px] mt-1.5 block text-right font-mono ${
                    msg.sender === 'user' ? 'text-indigo-200' : 'text-slate-500'
                  }`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 items-center">
                <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-slate-800 text-indigo-400 border border-slate-700">
                  <Bot size={15} />
                </div>
                <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Consultando banco de dados</span>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Área de Entrada de Texto (Input) - Fixo no rodapé */}
          <form onSubmit={handleSend} className="p-2.5 sm:p-3 bg-slate-900 border-t border-slate-800 shrink-0">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte sobre estoque, corredores, orçamentos..."
                className="w-full bg-slate-800/90 text-slate-100 placeholder-slate-500 rounded-full pl-4 pr-12 py-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-700 focus:border-indigo-500 transition-all"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-1.5 h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                aria-label="Enviar mensagem"
              >
                <Send size={15} className="ml-0.5" />
              </button>
            </div>
            <div className="text-center mt-1.5">
              <span className="text-[9px] text-slate-500 font-medium tracking-wide">
                Consultas em tempo real com base no estoque Neon PostgreSQL
              </span>
            </div>
          </form>

        </div>
      )}
    </>
  );
};
