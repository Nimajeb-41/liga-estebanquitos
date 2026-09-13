/**
 * Quién retransmite la liga.
 *
 * Vive en un solo sitio porque aparece en varios: la portada, la página de
 * transmisión, el aviso de directo y la ficha de cualquier partido en juego. Si
 * cambiara el canal, cambia aquí y cambia en todas.
 *
 * El texto describe **lo que hace**, no lo que suponemos de él. No hay cifras de
 * seguidores a propósito: envejecen en una semana y no le hacen ningún favor a
 * nadie.
 */

export interface StreamerChannel {
  readonly id: 'kick' | 'youtube' | 'instagram' | 'tiktok';
  readonly label: string;
  readonly handle: string;
  readonly url: string;
  /** El canal donde se emite la liga. Solo uno puede serlo. */
  readonly primary?: boolean;
}

export interface Streamer {
  readonly name: string;
  readonly role: string;
  readonly channels: readonly StreamerChannel[];
  /** Dónde se ve la liga. Es el enlace que aparece cuando hay un partido en juego. */
  readonly liveUrl: string;
  readonly liveLabel: string;
}

export const STREAMER: Streamer = {
  name: 'EsstebannPluss',
  role: 'Narración y retransmisión oficial',
  liveUrl: 'https://kick.com/esstebannpluss',
  liveLabel: 'Kick',
  channels: [
    {
      id: 'kick',
      label: 'Kick',
      handle: 'esstebannpluss',
      url: 'https://kick.com/esstebannpluss',
      primary: true,
    },
    {
      id: 'youtube',
      label: 'YouTube',
      handle: '@EsstebannPluss011',
      url: 'https://www.youtube.com/@EsstebannPluss011',
    },
    {
      id: 'instagram',
      label: 'Instagram',
      handle: '@esstebannpluss',
      url: 'https://www.instagram.com/esstebannpluss/',
    },
    {
      id: 'tiktok',
      label: 'TikTok',
      handle: '@esstebannpluss',
      url: 'https://www.tiktok.com/@esstebannpluss',
    },
  ],
};

/** Un canal por su identificador, para cuando la plantilla pide uno concreto. */
export function channel(id: StreamerChannel['id']): StreamerChannel | undefined {
  return STREAMER.channels.find((entry) => entry.id === id);
}
