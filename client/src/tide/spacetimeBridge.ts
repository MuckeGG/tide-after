/* eslint-disable @typescript-eslint/no-explicit-any -- generated SpacetimeDB bindings are optional until `spacetime generate` runs */
import type { TideGameState } from './types';

const TOKEN_KEY = 'tide-after.spacetime.token.v1';

export type CloudStatus = 'local' | 'connecting' | 'connected' | 'error';

interface BridgeOptions {
  initialState: TideGameState;
  onStatus: (status: CloudStatus) => void;
  onRemoteState: (state: TideGameState) => void;
}

interface SnapshotRow {
  stateJson?: string;
  state_json?: string;
}

const isTideState = (value: unknown): value is TideGameState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TideGameState>;
  return candidate.schemaVersion === 2 && typeof candidate.runId === 'string';
};

export class TideSpacetimeBridge {
  private connection: any | null = null;
  private subscription: any | null = null;
  private options: BridgeOptions | null = null;

  isConfigured() {
    return Boolean(import.meta.env.VITE_SPACETIME_HOST && import.meta.env.VITE_SPACETIME_MODULE);
  }

  async connect(options: BridgeOptions) {
    this.options = options;
    if (!this.isConfigured()) {
      options.onStatus('local');
      return;
    }

    options.onStatus('connecting');
    try {
      // Generated bindings gain the tide_* tables and reducers after running
      // `spacetime generate`; using a dynamic boundary keeps local mode usable
      // before the CLI is installed.
      const generated = await import('./generated');
      const DbConnection = generated.DbConnection as any;
      const savedToken = window.localStorage.getItem(TOKEN_KEY) ?? undefined;

      DbConnection.builder()
        .withUri(import.meta.env.VITE_SPACETIME_HOST)
        .withDatabaseName(import.meta.env.VITE_SPACETIME_MODULE)
        .withToken(savedToken)
        .onConnect((connection: any, identity: any, token: string) => {
          this.connection = connection;
          window.localStorage.setItem(TOKEN_KEY, token);
          this.subscribeToSnapshot(connection, identity.toHexString(), options.initialState);
        })
        .onConnectError((_context: unknown, error: Error) => {
          console.warn('[TideAfter] SpacetimeDB unavailable, staying local.', error);
          options.onStatus('error');
        })
        .onDisconnect(() => {
          this.connection = null;
          options.onStatus('local');
        })
        .build();
    } catch (error) {
      console.warn('[TideAfter] Could not initialize SpacetimeDB bridge.', error);
      options.onStatus('error');
    }
  }

  private subscribeToSnapshot(connection: any, identityHex: string, initialState: TideGameState) {
    const table = connection.db?.tideGameSnapshot;
    if (!table || !connection.reducers?.tideSyncSnapshot) {
      console.warn('[TideAfter] Regenerate SpacetimeDB bindings to enable cloud snapshots.');
      this.options?.onStatus('error');
      return;
    }

    const applyRow = (row: SnapshotRow) => {
      const raw = row.stateJson ?? row.state_json;
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isTideState(parsed)) this.options?.onRemoteState(parsed);
      } catch (error) {
        console.warn('[TideAfter] Ignoring invalid remote snapshot.', error);
      }
    };

    table.onInsert((_context: unknown, row: SnapshotRow) => applyRow(row));
    table.onUpdate((_context: unknown, _oldRow: SnapshotRow, row: SnapshotRow) => applyRow(row));

    const query = `SELECT * FROM tide_game_snapshot WHERE player_identity = '${identityHex}'`;
    this.subscription = connection
      .subscriptionBuilder()
      .onApplied(() => {
        let foundSnapshot = false;
        for (const row of table.iter()) {
          foundSnapshot = true;
          applyRow(row);
        }
        if (!foundSnapshot) this.save(initialState);
        this.options?.onStatus('connected');
      })
      .onError((error: unknown) => {
        console.warn('[TideAfter] Snapshot subscription failed.', error);
        this.options?.onStatus('error');
      })
      .subscribe(query);
  }

  save(state: TideGameState) {
    const reducer = this.connection?.reducers?.tideSyncSnapshot;
    if (!reducer) return;
    try {
      void reducer({
        schemaVersion: state.schemaVersion,
        guestId: state.guestId,
        runId: state.runId,
        stateJson: JSON.stringify(state),
      }).catch((error: unknown) => {
        console.warn('[TideAfter] Cloud checkpoint was rejected; local save remains intact.', error);
        this.options?.onStatus('error');
      });
    } catch (error) {
      console.warn('[TideAfter] Cloud checkpoint failed; local save remains intact.', error);
      this.options?.onStatus('error');
    }
  }

  disconnect() {
    try {
      this.subscription?.unsubscribe?.();
      this.connection?.disconnect?.();
    } finally {
      this.subscription = null;
      this.connection = null;
    }
  }
}
