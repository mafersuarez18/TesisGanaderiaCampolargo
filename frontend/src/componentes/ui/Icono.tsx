// Envuelve la fuente de iconos Material Symbols: `nombre` debe ser el
// nombre exacto del ligature de Google (p. ej. "pets", "wifi_off") — un
// nombre inválido se renderiza como texto literal en vez de un ícono.
// Excepción: los nombres de ICONOS_PROPIOS, que no existen en Material y se
// dibujan como SVG con el mismo tamaño (1em) y color (currentColor).
interface PropiedadesIcono {
  nombre: string;
  relleno?: boolean;
  clase?: string;
  opz?: number;
  peso?: number;
}

const ICONOS_PROPIOS: Record<string, (relleno: boolean) => React.ReactNode> = {
  // Vaca preñada vista de perfil: panza abultada con un corazón, mancha en
  // el lomo, cuerno y cola.
  vaca_prenada: (relleno) => (
    <>
      <path
        d="M4.2 9.6C4.2 8.3 5.1 7.5 6.5 7.5H15.6L17.2 6.1H19.4C19.9 6.1 20.2 6.4 20.4 6.8L21.8 9.9C22.1 10.7 21.5 11.4 20.7 11.3L18.6 10.9L17.2 12C17.2 14.9 15.4 17.2 11 17.2C7 17.2 4.6 15.5 4.2 12.5Z"
        fill={relleno ? 'currentColor' : 'none'}
        fillOpacity={relleno ? 0.25 : undefined}
      />
      <path d="M5.8 15.3V20.3M7.8 16.4V20.3M15 15.9V20.3M16.6 14.2V20.3" />
      <path d="M18.4 6.1C18.2 5.1 18.6 4.3 19.4 4M4.3 9.2C3.2 10 2.9 11.8 3.1 13.8" />
      <ellipse cx="8" cy="10.1" rx="1.5" ry="1.1" fill="currentColor" stroke="none" />
      <circle cx="19.6" cy="8.3" r="0.55" fill="currentColor" stroke="none" />
      <path
        d="M11.4 15C9.9 14 9.6 12.8 10.4 12.3C10.9 12 11.3 12.2 11.4 12.6C11.5 12.2 11.9 12 12.4 12.3C13.2 12.8 12.9 14 11.4 15Z"
        fill="currentColor"
        strokeWidth={0.8}
      />
    </>
  ),
};

export default function Icono({ nombre, relleno = false, clase = '', opz = 24, peso = 400 }: PropiedadesIcono) {
  const propio = ICONOS_PROPIOS[nombre];
  return (
    <span
      className={`material-symbols-outlined ${clase}`}
      style={{ fontVariationSettings: `'FILL' ${relleno ? 1 : 0}, 'wght' ${peso}, 'GRAD' 0, 'opsz' ${opz}` }}
      aria-hidden="true"
    >
      {propio ? (
        <svg
          viewBox="0 0 24 24"
          width="1em"
          height="1em"
          fill="none"
          stroke="currentColor"
          strokeWidth={peso >= 600 ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: 'block' }}
        >
          {propio(relleno)}
        </svg>
      ) : nombre}
    </span>
  );
}
