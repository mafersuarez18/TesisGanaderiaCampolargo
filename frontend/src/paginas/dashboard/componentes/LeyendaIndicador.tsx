import * as Popover from '@radix-ui/react-popover';
import Icono from '../../../componentes/ui/Icono';

// Botón de información de cada indicador del dashboard: al tocarlo se
// despliega una leyenda con qué mide el número, la fórmula y el cálculo
// concreto con los valores actuales. Se abre con clic (no con hover) para
// que funcione igual en el teléfono.

export interface ExplicacionIndicador {
  titulo: string;
  descripcion: string;
  formula?: string;
  calculo?: string;
  nota?: string;
}

export default function LeyendaIndicador({ explicacion }: { explicacion: ExplicacionIndicador }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`¿Cómo se calcula ${explicacion.titulo}?`}
          className="flex-shrink-0 w-6 h-6 -m-1 rounded-full flex items-center justify-center
                     text-on-surface-variant/70 hover:text-primary hover:bg-primary/10
                     data-[state=open]:text-primary data-[state=open]:bg-primary/10 transition-colors"
        >
          <Icono nombre="info" clase="text-[16px]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-3.5 text-xs leading-relaxed
                     text-on-surface shadow-lg border border-outline-variant/40 space-y-2"
        >
          <p className="font-semibold text-sm">{explicacion.titulo}</p>
          <p className="text-on-surface-variant">{explicacion.descripcion}</p>
          {explicacion.formula && (
            <div>
              <p className="text-[10px] uppercase font-semibold tracking-wider text-on-surface-variant">Fórmula</p>
              <p className="font-medium">{explicacion.formula}</p>
            </div>
          )}
          {explicacion.calculo && (
            <div className="rounded-lg bg-primary/5 border border-primary/15 px-2.5 py-1.5">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-primary">Cálculo actual</p>
              <p className="font-medium">{explicacion.calculo}</p>
            </div>
          )}
          {explicacion.nota && (
            <p className="text-on-surface-variant italic">{explicacion.nota}</p>
          )}
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
