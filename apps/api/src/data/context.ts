/**
 * Contexto de aplicacion.
 *
 * Es lo unico que reciben los servicios: la base de datos, la configuracion, el
 * reloj y, si hace falta, el cliente de Clash Royale. Inyectar el reloj permite
 * probar plazos (las 24 h de impugnacion) sin esperar 24 horas; inyectar el
 * cliente permite probar la importacion entera sin depender de Supercell ni
 * gastar peticiones.
 */

import type { LigaDatabase } from '@liga/database/client';

import type { ApiConfig } from '../config.ts';
import type { EventBus } from '../events.ts';
import type { ClashRoyaleClient } from '../integrations/clash-royale/client.ts';
import type { KickClient } from '../integrations/kick/client.ts';

export interface AppContext {
  readonly db: LigaDatabase;
  readonly config: ApiConfig;
  readonly now: () => Date;
  /**
   * Cliente de Clash Royale.
   *
   * En produccion no se pasa: el servicio lo construye con el token de la
   * configuracion. Existe como punto de inyeccion para los tests, por la misma
   * razon que `now`: `npm test` no puede depender de una API de terceros.
   */
  readonly clashRoyaleClient?: ClashRoyaleClient;
  /**
   * Eventos internos de la competicion.
   *
   * Un servicio anuncia lo que paso; quien reacciona es asunto de quien se
   * suscriba. Opcional a proposito: un script que solo lee no necesita bus, y
   * los servicios comprueban antes de emitir.
   */
  readonly events?: EventBus;
  /**
   * Estado del canal de retransmision.
   *
   * Ausente cuando la comprobacion esta apagada. Quien lo use tiene que tratar
   * esa ausencia como «no se sabe», nunca como «no hay directo».
   */
  readonly kick?: KickClient;
}

/** Identidad del administrador autenticado que ejecuta una operacion. */
export interface AdminIdentity {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: 'OWNER' | 'ADMIN' | 'REFEREE' | 'VIEWER';
  /**
   * La peticion HTTP que ejecuta esta operacion.
   *
   * Va a la auditoria para poder cruzar una entrada con sus lineas de registro
   * cuando algo sale raro. Queda vacio cuando la operacion no viene de una
   * peticion —un script, una siembra— y en ese caso no se inventa ninguno.
   */
  readonly requestId?: string;
}
