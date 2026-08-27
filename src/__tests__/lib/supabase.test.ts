import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseDatabaseClient } from '@/lib/supabase';
import {
  createDatabaseClient,
  type CreateDashboardInput,
  type CreateNoteInput,
  type UpdateNoteInput,
  type Dashboard,
  type DashboardUser,
  type Note,
  type NoteVersion,
} from '@/client/db-client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  returns: ReturnType<typeof vi.fn>;
  abortSignal: ReturnType<typeof vi.fn>;
  then: (
    onResolve?: (value: unknown) => unknown,
    onReject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}

describe('src/lib/supabase domain adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('constructor and client initialization', () => {
    it('throws error when SUPABASE_URL is missing', () => {
      vi.stubEnv('SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_KEY', 'some-key');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      expect(() => new SupabaseDatabaseClient()).toThrow(
        'Missing required environment variables: SUPABASE_URL and/or SUPABASE_KEY.'
      );
    });

    it('throws error when SUPABASE_KEY and SUPABASE_SERVICE_ROLE_KEY are both missing', () => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_KEY', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      expect(() => new SupabaseDatabaseClient()).toThrow(
        'Missing required environment variables: SUPABASE_URL and/or SUPABASE_KEY.'
      );
    });

    it('uses SUPABASE_SERVICE_ROLE_KEY when SUPABASE_KEY is absent', () => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_KEY', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret');

      expect(() => new SupabaseDatabaseClient()).not.toThrow();
    });

    it('uses SUPABASE_KEY when SUPABASE_SERVICE_ROLE_KEY is absent', () => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_KEY', 'anon-or-service-key');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      expect(() => new SupabaseDatabaseClient()).not.toThrow();
    });

    it('accepts custom injected SupabaseClient instance', () => {
      const mockClient = {} as unknown as SupabaseClient;
      const client = new SupabaseDatabaseClient(mockClient);
      expect(client).toBeDefined();
    });

    it('createDatabaseClient factory creates SupabaseDatabaseClient', () => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_KEY', 'test-key');

      const dbClient = createDatabaseClient();
      expect(dbClient).toBeInstanceOf(SupabaseDatabaseClient);
    });
  });

  describe('Domain Operations with Mocked Client', () => {
    function createQueryBuilderMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }): MockQueryBuilder {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(resolvedValue),
        maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
        returns: vi.fn().mockResolvedValue(resolvedValue),
        abortSignal: vi.fn().mockReturnThis(),
        then: (onResolve, onReject) =>
          Promise.resolve(resolvedValue).then(onResolve, onReject),
      };
      return builder;
    }

    describe('createDashboard', () => {
      it('creates dashboard and users atomically via rpc with explicit hash', async () => {
        const mockDashboard: Dashboard = {
          id: 'dash-uuid-1',
          hash: 'custom_hash_1234',
          title: 'Project Alpha',
          description: 'Team dashboard',
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:00:00Z',
        };

        const mockUsers: Omit<DashboardUser, 'password_hash'>[] = [
          {
            id: 'user-uuid-1',
            dashboard_id: 'dash-uuid-1',
            user_alias: 'Alice',
            created_at: '2026-08-20T10:00:00Z',
          },
          {
            id: 'user-uuid-2',
            dashboard_id: 'dash-uuid-1',
            user_alias: 'Bob',
            created_at: '2026-08-20T10:00:00Z',
          },
        ];

        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: {
              dashboard: mockDashboard,
              users: mockUsers,
            },
            error: null,
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const input: CreateDashboardInput = {
          title: 'Project Alpha',
          description: 'Team dashboard',
          hash: 'custom_hash_1234',
          users: [
            { user_alias: 'Alice', password_hash: '$pbkdf2$100000$salt$hash1' },
            { user_alias: 'Bob', password_hash: '$pbkdf2$100000$salt$hash2' },
          ],
        };

        const result = await db.createDashboard(input);
        expect(result.dashboard).toEqual(mockDashboard);
        expect(result.users).toEqual(mockUsers);
        expect(mockSupabase.rpc).toHaveBeenCalledWith('create_dashboard_with_users', {
          p_title: 'Project Alpha',
          p_description: 'Team dashboard',
          p_hash: 'custom_hash_1234',
          p_users: input.users,
        });
      });

      it('generates random slug when hash is omitted and defaults empty users array', async () => {
        const mockDashboard: Dashboard = {
          id: 'dash-uuid-2',
          hash: 'auto_generated16',
          title: 'Solo Dashboard',
          description: null,
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:00:00Z',
        };

        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: {
              dashboard: mockDashboard,
              users: [],
            },
            error: null,
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.createDashboard({
          title: 'Solo Dashboard',
          users: [],
        });

        expect(result.dashboard).toEqual(mockDashboard);
        expect(result.users).toEqual([]);
      });

      it('throws descriptive error if rpc execution fails or returns null', async () => {
        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Unique constraint violation on hash' },
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(
          db.createDashboard({
            title: 'Fail Dashboard',
            users: [],
          })
        ).rejects.toThrow(
          '[SupabaseDatabaseClient] Failed to create dashboard: Unique constraint violation on hash'
        );

        // Test data null with error null
        const mockSupabaseNullData = {
          rpc: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        } as unknown as SupabaseClient;
        const dbNullData = new SupabaseDatabaseClient(mockSupabaseNullData);
        await expect(
          dbNullData.createDashboard({
            title: 'Fail Dashboard',
            users: [],
          })
        ).rejects.toThrow(
          '[SupabaseDatabaseClient] Failed to create dashboard: Unknown error'
        );
      });
    });

    describe('getDashboardByHash and getDashboardById', () => {
      const mockDashboard: Dashboard = {
        id: 'dash-uuid-1',
        hash: 'valid_hash_12345',
        title: 'Alpha',
        description: 'Test',
        created_at: '2026-08-20T10:00:00Z',
        updated_at: '2026-08-20T10:00:00Z',
      };

      it('getDashboardByHash returns dashboard when found', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: mockDashboard, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.getDashboardByHash('valid_hash_12345');
        expect(result).toEqual(mockDashboard);
      });

      it('getDashboardByHash returns null when record not found', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.getDashboardByHash('non_existent');
        expect(result).toBeNull();
      });

      it('getDashboardByHash throws descriptive error on Supabase failure', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Connection timeout' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.getDashboardByHash('hash')).rejects.toThrow(
          '[SupabaseDatabaseClient] getDashboardByHash failed: Connection timeout'
        );
      });

      it('getDashboardById returns dashboard when found and null when absent', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: mockDashboard, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.getDashboardById('dash-uuid-1')).toEqual(mockDashboard);

        const mockSupabaseNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        expect(await dbNull.getDashboardById('dash-unknown')).toBeNull();
      });

      it('getDashboardById throws descriptive error on failure', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Database query error' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.getDashboardById('id')).rejects.toThrow(
          '[SupabaseDatabaseClient] getDashboardById failed: Database query error'
        );
      });
    });

    describe('deleteDashboard', () => {
      it('returns true when rows are deleted', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: [{ id: 'dash-uuid-1' }], error: null })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const deleted = await db.deleteDashboard('dash-uuid-1');
        expect(deleted).toBe(true);
      });

      it('returns false when no rows were deleted', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: [], error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const deleted = await db.deleteDashboard('dash-unknown');
        expect(deleted).toBe(false);
      });

      it('throws descriptive error on failure', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Delete constraint error' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.deleteDashboard('id')).rejects.toThrow(
          '[SupabaseDatabaseClient] deleteDashboard failed: Delete constraint error'
        );
      });
    });

    describe('getDashboardUserByAlias and listDashboardUsers', () => {
      const mockUser: DashboardUser = {
        id: 'user-uuid-1',
        dashboard_id: 'dash-uuid-1',
        user_alias: 'Alice',
        password_hash: '$pbkdf2$hash',
        created_at: '2026-08-20T10:00:00Z',
      };

      it('getDashboardUserByAlias returns user or null', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: mockUser, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.getDashboardUserByAlias('dash-uuid-1', 'Alice')).toEqual(mockUser);

        const mockSupabaseNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        expect(await dbNull.getDashboardUserByAlias('dash-uuid-1', 'Unknown')).toBeNull();
      });

      it('getDashboardUserByAlias throws descriptive error on failure', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Read error' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.getDashboardUserByAlias('dash-uuid-1', 'Alice')).rejects.toThrow(
          '[SupabaseDatabaseClient] getDashboardUserByAlias failed: Read error'
        );
      });

      it('listDashboardUsers returns list of users without password_hash', async () => {
        const userList = [
          {
            id: 'user-uuid-1',
            dashboard_id: 'dash-uuid-1',
            user_alias: 'Alice',
            created_at: '2026-08-20T10:00:00Z',
          },
          {
            id: 'user-uuid-2',
            dashboard_id: 'dash-uuid-1',
            user_alias: 'Bob',
            created_at: '2026-08-20T10:05:00Z',
          },
        ];

        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: userList, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const users = await db.listDashboardUsers('dash-uuid-1');
        expect(users).toEqual(userList);
      });

      it('listDashboardUsers returns empty array when data is null', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const users = await db.listDashboardUsers('dash-uuid-1');
        expect(users).toEqual([]);
      });

      it('listDashboardUsers throws descriptive error on failure', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'List error' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.listDashboardUsers('dash-uuid-1')).rejects.toThrow(
          '[SupabaseDatabaseClient] listDashboardUsers failed: List error'
        );
      });
    });

    describe('createNote', () => {
      it('creates note and initial version 1 snapshot atomically via rpc', async () => {
        const mockNote: Note = {
          id: 'note-uuid-1',
          dashboard_id: 'dash-uuid-1',
          title: 'Grocery List',
          content: 'Milk, Bread, Eggs',
          version: 1,
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:00:00Z',
        };

        const mockVersion: NoteVersion = {
          id: 'version-uuid-1',
          note_id: 'note-uuid-1',
          version: 1,
          title: 'Grocery List',
          content: 'Milk, Bread, Eggs',
          author_id: 'user-uuid-1',
          created_at: '2026-08-20T10:00:00Z',
        };

        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: {
              note: mockNote,
              initialVersion: mockVersion,
            },
            error: null,
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const input: CreateNoteInput = {
          dashboard_id: 'dash-uuid-1',
          title: 'Grocery List',
          content: 'Milk, Bread, Eggs',
          author_id: 'user-uuid-1',
        };

        const result = await db.createNote(input);
        expect(result.note).toEqual(mockNote);
        expect(result.initialVersion).toEqual(mockVersion);
        expect(mockSupabase.rpc).toHaveBeenCalledWith('create_note_with_version', {
          p_dashboard_id: 'dash-uuid-1',
          p_title: 'Grocery List',
          p_content: 'Milk, Bread, Eggs',
          p_author_id: 'user-uuid-1',
        });
      });

      it('defaults title to empty string and author_id to null when omitted', async () => {
        const mockNote: Note = {
          id: 'note-uuid-2',
          dashboard_id: 'dash-uuid-1',
          title: '',
          content: 'Untitled note content',
          version: 1,
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:00:00Z',
        };

        const mockVersion: NoteVersion = {
          id: 'version-uuid-2',
          note_id: 'note-uuid-2',
          version: 1,
          title: '',
          content: 'Untitled note content',
          author_id: null,
          created_at: '2026-08-20T10:00:00Z',
        };

        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: {
              note: mockNote,
              initialVersion: mockVersion,
            },
            error: null,
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.createNote({
          dashboard_id: 'dash-uuid-1',
          content: 'Untitled note content',
        });

        expect(result.note.title).toBe('');
        expect(result.initialVersion.author_id).toBeNull();
        expect(mockSupabase.rpc).toHaveBeenCalledWith('create_note_with_version', {
          p_dashboard_id: 'dash-uuid-1',
          p_title: '',
          p_content: 'Untitled note content',
          p_author_id: null,
        });
      });

      it('throws descriptive error if rpc creation fails or returns null', async () => {
        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Foreign key violation' },
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(
          db.createNote({
            dashboard_id: 'non-existent',
            content: 'Text',
          })
        ).rejects.toThrow('[SupabaseDatabaseClient] createNote failed: Foreign key violation');

        // Test note null data with null error
        const mockSupabaseNull = {
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        await expect(
          dbNull.createNote({
            dashboard_id: 'dash-1',
            content: 'Text',
          })
        ).rejects.toThrow('[SupabaseDatabaseClient] createNote failed: Unknown error');
      });
    });

    describe('updateNote (optimistic concurrency via rpc)', () => {
      it('successfully increments version and creates history snapshot atomically', async () => {
        const updatedNote: Note = {
          id: 'note-uuid-1',
          dashboard_id: 'dash-uuid-1',
          title: 'Updated Title',
          content: 'Updated content',
          version: 2,
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:05:00Z',
        };

        const newVersion: NoteVersion = {
          id: 'version-uuid-2',
          note_id: 'note-uuid-1',
          version: 2,
          title: 'Updated Title',
          content: 'Updated content',
          author_id: 'user-uuid-2',
          created_at: '2026-08-20T10:05:00Z',
        };

        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: {
              note: updatedNote,
              newVersion: newVersion,
            },
            error: null,
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const input: UpdateNoteInput = {
          note_id: 'note-uuid-1',
          title: 'Updated Title',
          content: 'Updated content',
          expected_version: 1,
          author_id: 'user-uuid-2',
        };

        const result = await db.updateNote(input);
        expect(result.note).toEqual(updatedNote);
        expect(result.newVersion).toEqual(newVersion);
        expect(mockSupabase.rpc).toHaveBeenCalledWith('update_note_with_version', {
          p_note_id: 'note-uuid-1',
          p_expected_version: 1,
          p_content: 'Updated content',
          p_title: 'Updated Title',
          p_author_id: 'user-uuid-2',
        });
      });

      it('supports updating content while omitting title', async () => {
        const updatedNote: Note = {
          id: 'note-uuid-1',
          dashboard_id: 'dash-uuid-1',
          title: 'Original Title',
          content: 'Only content changed',
          version: 2,
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:05:00Z',
        };

        const newVersion: NoteVersion = {
          id: 'version-uuid-2',
          note_id: 'note-uuid-1',
          version: 2,
          title: 'Original Title',
          content: 'Only content changed',
          author_id: null,
          created_at: '2026-08-20T10:05:00Z',
        };

        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: {
              note: updatedNote,
              newVersion: newVersion,
            },
            error: null,
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.updateNote({
          note_id: 'note-uuid-1',
          content: 'Only content changed',
          expected_version: 1,
        });

        expect(result.note).toEqual(updatedNote);
        expect(result.newVersion).toEqual(newVersion);
        expect(mockSupabase.rpc).toHaveBeenCalledWith('update_note_with_version', {
          p_note_id: 'note-uuid-1',
          p_expected_version: 1,
          p_content: 'Only content changed',
          p_title: null,
          p_author_id: null,
        });
      });

      it('throws optimistic concurrency error when rpc fails with version conflict', async () => {
        const mockSupabase = {
          rpc: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Version mismatch or note not found (expected version 1)' },
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(
          db.updateNote({
            note_id: 'note-uuid-1',
            content: 'Conflicting update',
            expected_version: 1,
          })
        ).rejects.toThrow(
          '[SupabaseDatabaseClient] updateNote failed: Version mismatch or note not found (expected version 1)'
        );

        // Test data null with error null
        const mockSupabaseNull = {
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        await expect(
          dbNull.updateNote({
            note_id: 'note-uuid-1',
            content: 'Conflicting update',
            expected_version: 1,
          })
        ).rejects.toThrow(
          '[SupabaseDatabaseClient] updateNote failed: Unknown error'
        );
      });
    });

    describe('getNotesByDashboard and getNoteById', () => {
      const mockNotes: Note[] = [
        {
          id: 'note-uuid-1',
          dashboard_id: 'dash-uuid-1',
          title: 'Note 1',
          content: 'Content 1',
          version: 1,
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:00:00Z',
        },
      ];

      it('getNotesByDashboard returns list of notes', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: mockNotes, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.getNotesByDashboard('dash-uuid-1')).toEqual(mockNotes);
      });

      it('getNotesByDashboard returns empty array when null and throws on error', async () => {
        const mockSupabaseNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        expect(await dbNull.getNotesByDashboard('dash-uuid-1')).toEqual([]);

        const mockSupabaseErr = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: { message: 'Err' } })),
        } as unknown as SupabaseClient;
        const dbErr = new SupabaseDatabaseClient(mockSupabaseErr);
        await expect(dbErr.getNotesByDashboard('dash-uuid-1')).rejects.toThrow(
          '[SupabaseDatabaseClient] getNotesByDashboard failed: Err'
        );
      });

      it('getNoteById returns note or null', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: mockNotes[0], error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.getNoteById('note-uuid-1')).toEqual(mockNotes[0]);

        const mockSupabaseNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        expect(await dbNull.getNoteById('note-unknown')).toBeNull();
      });

      it('getNoteById throws on error', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Fetch error' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.getNoteById('note-uuid-1')).rejects.toThrow(
          '[SupabaseDatabaseClient] getNoteById failed: Fetch error'
        );
      });
    });

    describe('getNoteVersions and deleteNote', () => {
      const mockVersions: NoteVersion[] = [
        {
          id: 'v2',
          note_id: 'n1',
          version: 2,
          title: 'T2',
          content: 'C2',
          author_id: 'a1',
          created_at: '2026-08-20T10:05:00Z',
        },
        {
          id: 'v1',
          note_id: 'n1',
          version: 1,
          title: 'T1',
          content: 'C1',
          author_id: 'a1',
          created_at: '2026-08-20T10:00:00Z',
        },
      ];

      it('getNoteVersions returns versions ordered descending', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: mockVersions, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.getNoteVersions('n1')).toEqual(mockVersions);
      });

      it('getNoteVersions returns empty array when null and throws on error', async () => {
        const mockSupabaseNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        expect(await dbNull.getNoteVersions('n1')).toEqual([]);

        const mockSupabaseErr = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: { message: 'Err' } })),
        } as unknown as SupabaseClient;
        const dbErr = new SupabaseDatabaseClient(mockSupabaseErr);
        await expect(dbErr.getNoteVersions('n1')).rejects.toThrow(
          '[SupabaseDatabaseClient] getNoteVersions failed: Err'
        );
      });

      it('deleteNote returns true when note is deleted, false when not found', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: [{ id: 'n1' }], error: null })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.deleteNote('n1')).toBe(true);

        const mockSupabaseNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: [], error: null })),
        } as unknown as SupabaseClient;
        const dbNull = new SupabaseDatabaseClient(mockSupabaseNull);
        expect(await dbNull.deleteNote('n1')).toBe(false);
      });

      it('deleteNote throws on database error', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Delete err' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        await expect(db.deleteNote('n1')).rejects.toThrow(
          '[SupabaseDatabaseClient] deleteNote failed: Delete err'
        );
      });
    });

    describe('Audit info methods', () => {
      it('records deployment audit idempotently', async () => {
        const auditRow = {
          id: 1,
          app_version: '0.1.0',
          init_data: '{}',
          created_at: '2026-08-20T10:00:00Z',
        };

        // Case 1: Record already exists
        const mockSupabaseExisting = {
          from: vi.fn(() => createQueryBuilderMock({ data: auditRow, error: null })),
        } as unknown as SupabaseClient;

        const dbExisting = new SupabaseDatabaseClient(mockSupabaseExisting);
        const resultExisting = await dbExisting.recordDeploymentAudit({ app_version: '0.1.0' });
        expect(resultExisting.recorded).toBe(false);
        expect(resultExisting.record).toEqual(auditRow);

        // Case 2: New record inserted
        const mockSupabaseNew = {
          from: vi.fn(() => {
            const builder = {
              select: vi.fn().mockReturnThis(),
              insert: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              single: vi.fn().mockResolvedValue({ data: auditRow, error: null }),
            };
            return builder;
          }),
        } as unknown as SupabaseClient;

        const dbNew = new SupabaseDatabaseClient(mockSupabaseNew);
        const resultNew = await dbNew.recordDeploymentAudit({ app_version: '0.1.0' });
        expect(resultNew.recorded).toBe(true);
        expect(resultNew.record).toEqual(auditRow);
      });

      it('throws on insert or version lookup failure in recordDeploymentAudit', async () => {
        const mockSupabaseErr = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Lookup err' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabaseErr);
        await expect(db.recordDeploymentAudit({ app_version: '0.1.0' })).rejects.toThrow(
          '[SupabaseDatabaseClient] Version lookup failed: Lookup err'
        );

        const mockSupabaseInsertErr = {
          from: vi.fn(() => {
            const builder = {
              select: vi.fn().mockReturnThis(),
              insert: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
            };
            return builder;
          }),
        } as unknown as SupabaseClient;

        const dbInsertErr = new SupabaseDatabaseClient(mockSupabaseInsertErr);
        await expect(dbInsertErr.recordDeploymentAudit({ app_version: '0.1.0' })).rejects.toThrow(
          '[SupabaseDatabaseClient] Insert failed: Insert failed'
        );
      });

      it('getLastAuditRecord and getAuditHistory return records or handle errors', async () => {
        const auditRow = {
          id: 1,
          app_version: '0.1.0',
          init_data: null,
          created_at: '2026-08-20T10:00:00Z',
        };

        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: auditRow, error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        expect(await db.getLastAuditRecord()).toEqual(auditRow);

        const mockSupabaseHistory = {
          from: vi.fn(() => createQueryBuilderMock({ data: [auditRow], error: null })),
        } as unknown as SupabaseClient;

        const dbHistory = new SupabaseDatabaseClient(mockSupabaseHistory);
        expect(await dbHistory.getAuditHistory()).toEqual([auditRow]);

        const mockSupabaseHistoryNull = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: null })),
        } as unknown as SupabaseClient;
        const dbHistoryNull = new SupabaseDatabaseClient(mockSupabaseHistoryNull);
        expect(await dbHistoryNull.getAuditHistory()).toEqual([]);

        const mockSupabaseErr = {
          from: vi.fn(() => createQueryBuilderMock({ data: null, error: { message: 'Fail' } })),
        } as unknown as SupabaseClient;
        const dbErr = new SupabaseDatabaseClient(mockSupabaseErr);
        await expect(dbErr.getLastAuditRecord()).rejects.toThrow(
          '[SupabaseDatabaseClient] getLastAuditRecord failed: Fail'
        );
        await expect(dbErr.getAuditHistory()).rejects.toThrow(
          '[SupabaseDatabaseClient] getAuditHistory failed: Fail'
        );
      });
    });

    describe('checkHealth', () => {
      it('returns status up and latencyMs on successful probe', async () => {
        const mockSupabase = {
          from: vi.fn(() => createQueryBuilderMock({ data: [{ id: 1 }], error: null })),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.checkHealth();

        expect(result.status).toBe('up');
        expect(typeof result.latencyMs).toBe('number');
        expect(result.error).toBeUndefined();
      });

      it('passes abortSignal to query builder when signal is provided', async () => {
        const queryMock = createQueryBuilderMock({ data: [{ id: 1 }], error: null });
        const mockSupabase = {
          from: vi.fn(() => queryMock),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const signal = AbortSignal.timeout(5000);
        const result = await db.checkHealth(signal);

        expect(result.status).toBe('up');
        expect(queryMock.abortSignal).toHaveBeenCalledWith(signal);
      });

      it('returns status down, latencyMs, and error message when query fails with database error', async () => {
        const mockSupabase = {
          from: vi.fn(() =>
            createQueryBuilderMock({ data: null, error: { message: 'Connection timeout' } })
          ),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.checkHealth();

        expect(result.status).toBe('down');
        expect(typeof result.latencyMs).toBe('number');
        expect(result.error).toBe('Connection timeout');
      });

      it('catches thrown exceptions during probe and returns status down with error message', async () => {
        const mockSupabase = {
          from: vi.fn(() => {
            throw new Error('Immediate network crash');
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.checkHealth();

        expect(result.status).toBe('down');
        expect(typeof result.latencyMs).toBe('number');
        expect(result.error).toBe('Immediate network crash');
      });

      it('handles non-Error thrown values gracefully', async () => {
        const mockSupabase = {
          from: vi.fn(() => {
            throw 'String failure';
          }),
        } as unknown as SupabaseClient;

        const db = new SupabaseDatabaseClient(mockSupabase);
        const result = await db.checkHealth();

        expect(result.status).toBe('down');
        expect(typeof result.latencyMs).toBe('number');
        expect(result.error).toBe('Unknown health check error');
      });
    });
  });
});

