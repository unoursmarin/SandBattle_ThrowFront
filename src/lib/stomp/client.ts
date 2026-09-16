import { Client, type IMessage } from "@stomp/stompjs";
import { Observable, ReplaySubject, Subject, switchMap } from "rxjs";

/**
 * Connexion STOMP unique, partagée par toutes les souscriptions de l'app
 * (voir docs/architecture/state-management.md). `connected$` rejoue le
 * client courant à chaque connexion (initiale ou après reconnexion) : tout
 * abonnement à une destination via `messages$` se resouscrit automatiquement.
 * `reconnected$` émet séparément, en excluant la connexion initiale : le
 * WebSocket ne rejoue pas l'historique manqué pendant une coupure, donc un
 * abonné doit resynchroniser son état via un re-fetch REST plutôt que se
 * fier aux seuls messages à venir (voir state-management.md).
 */
class StompConnection {
  private readonly client: Client;
  private readonly connected$ = new ReplaySubject<Client>(1);
  private readonly reconnected$ = new Subject<void>();
  private hasConnectedOnce = false;

  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.client = new Client({
      // Transport WebSocket brut sur le sous-chemin /websocket exposé par
      // l'endpoint SockJS du backend (voir websocket-stomp.md côté backend) :
      // pas besoin de la librairie sockjs-client côté frontend.
      brokerURL: `${protocol}//${window.location.host}/ws/websocket`,
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    });
    this.client.onConnect = () => {
      if (this.hasConnectedOnce) {
        this.reconnected$.next();
      }
      this.hasConnectedOnce = true;
      this.connected$.next(this.client);
    };
    this.client.activate();
  }

  messages$(destination: string): Observable<IMessage> {
    return this.connected$.pipe(
      switchMap(
        (client) =>
          new Observable<IMessage>((subscriber) => {
            const subscription = client.subscribe(destination, (message) => {
              subscriber.next(message);
            });
            return () => subscription.unsubscribe();
          }),
      ),
    );
  }

  onReconnect$(): Observable<void> {
    return this.reconnected$.asObservable();
  }
}

let connection: StompConnection | null = null;

function getConnection(): StompConnection {
  connection ??= new StompConnection();
  return connection;
}

export function stompMessages$(destination: string): Observable<IMessage> {
  return getConnection().messages$(destination);
}

/** Émet à chaque reconnexion STOMP (jamais à la connexion initiale). */
export function stompReconnected$(): Observable<void> {
  return getConnection().onReconnect$();
}
