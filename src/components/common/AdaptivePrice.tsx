import React from 'react';

interface AdaptivePriceProps {
  value?: number | string;
  colorClass?: string;
  className?: string;
}

/**
 * AdaptivePrice:
 * Formata valores numéricos de preço garantindo visualização 100% nítida das casas decimais.
 * Ajusta a escala da fonte dinamicamente com base na magnitude do valor (10,00 vs 100,00 vs 1.000,00 vs 10.000,00)
 * para que em qualquer tela de celular NUNCA corte as casas decimais.
 */
export const AdaptivePrice: React.FC<AdaptivePriceProps> = ({
  value,
  colorClass = 'text-slate-900 dark:text-white',
  className = '',
}) => {
  const num = typeof value === 'number' ? value : Number(value) || 0;
  
  // Formata com 2 casas decimais no padrão brasileiro
  const formatted = num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const [inteiro, centavos] = formatted.split(',');

  // Escala dinâmica de tamanho de fonte por magnitude do valor:
  // - Até R$ 99,99 (ex: 10,00): text-2xl sm:text-3xl
  // - De R$ 100,00 a R$ 999,99 (ex: 150,00): text-xl sm:text-2xl
  // - De R$ 1.000,00 a R$ 9.999,99 (ex: 1.250,00): text-lg sm:text-xl
  // - Acima de R$ 10.000,00 (ex: 12.800,00): text-sm sm:text-base com tracking compacto
  let mainFontSize = 'text-xl sm:text-2xl md:text-3xl';
  let centsFontSize = 'text-xs sm:text-sm md:text-base';

  if (num >= 10000) {
    mainFontSize = 'text-xs sm:text-sm md:text-base tracking-tighter';
    centsFontSize = 'text-[10px] sm:text-xs';
  } else if (num >= 1000) {
    mainFontSize = 'text-base sm:text-lg md:text-xl tracking-tight';
    centsFontSize = 'text-xs sm:text-sm';
  } else if (num >= 100) {
    mainFontSize = 'text-lg sm:text-xl md:text-2xl';
    centsFontSize = 'text-xs sm:text-sm';
  }

  return (
    <div
      className={`font-mono font-black ${colorClass} inline-flex items-baseline justify-center whitespace-nowrap leading-tight ${className}`}
      title={`R$ ${formatted}`}
    >
      <span className={mainFontSize}>{inteiro}</span>
      <span className={`opacity-90 font-bold ml-0.5 ${centsFontSize}`}>,{centavos}</span>
    </div>
  );
};
