import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Database } from 'sqlite3';
import request from 'supertest';
import { request as undiciRequest } from 'undici';

const mockEnv = {
  isProduction: false,
  jwt: {
    secret: 'test-secret-that-is-at-least-thirty-two-characters',
    expiresIn: '7d',
  },
};

jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.mock('../../db/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('undici', () => ({
  request: jest.fn(),
}));

import { getDb } from '../../db/database';
import { CREATE_GRADING_RESULTS_SQL } from '../../db/gradingSchema';
import gradingRouter from '../grading';

const mockGetDb = getDb as jest.MockedFunction<typeof getDb>;
const mockUndiciRequest = undiciRequest as jest.MockedFunction<typeof undiciRequest>;

const db = new Database(':memory:');
const app = express();
app.use(express.json());
app.use('/api/grading', gradingRouter);

function run(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (error) => (error ? reject(error) : resolve()));
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row as T | undefined)));
  });
}

function tokenFor(id: number): string {
  return jwt.sign(
    { id, email: `user-${id}@example.com`, username: `user-${id}`, role: 'user' },
    mockEnv.jwt.secret
  );
}

describe('grading authorization', () => {
  beforeAll(async () => {
    mockGetDb.mockReturnValue(db);
    await run(CREATE_GRADING_RESULTS_SQL);
  });

  beforeEach(async () => {
    await run('DELETE FROM grading_results');
    await run(
      `INSERT INTO grading_results (
        id, user_id, card_id, card_name, game,
        centering_score, corners_score, edges_score, surface_score,
        total_score, grade, grade_label, defects, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'user-one-result',
        '1',
        'card-1',
        'Private Card',
        'pokemon',
        9,
        9,
        9,
        9,
        9,
        9,
        'Mint',
        '{}',
        'https://private.example/card.jpg',
      ]
    );
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        db.close((error) => (error ? reject(error) : resolve()));
      })
  );

  it('requires authentication for grading history and scopes all history to the caller', async () => {
    await request(app).get('/api/grading/history').expect(401);

    const otherUser = await request(app)
      .get('/api/grading/history')
      .set('Authorization', `Bearer ${tokenFor(2)}`)
      .expect(200);
    expect(otherUser.body.data.history).toEqual([]);

    const owner = await request(app)
      .get('/api/grading/history/card-1')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .expect(200);
    expect(owner.body.data.history).toHaveLength(1);
    expect(owner.body.data.history[0].id).toBe('user-one-result');

    const otherUserByCard = await request(app)
      .get('/api/grading/history/card-1')
      .set('Authorization', `Bearer ${tokenFor(2)}`)
      .expect(200);
    expect(otherUserByCard.body.data.history).toEqual([]);
  });

  it('does not persist an anonymous analysis result or its image', async () => {
    const category = {
      score: 9,
      details: '',
      deviations: { leftRight: 0, topBottom: 0 },
      defects: [],
    };
    mockUndiciRequest.mockResolvedValue({
      statusCode: 200,
      body: {
        json: async () => ({
          success: true,
          grading: {
            id: 'anonymous-result',
            cardId: 'card-anonymous',
            cardName: 'Anonymous Card',
            game: 'pokemon',
            centering: category,
            corners: category,
            edges: category,
            surface: category,
            totalScore: 9,
            grade: 9,
            gradeLabel: 'Mint',
            imageUrl: 'https://private.example/anonymous.jpg',
          },
        }),
      },
    } as Awaited<ReturnType<typeof undiciRequest>>);

    await request(app)
      .post('/api/grading/analyze')
      .send({ image: 'base64-image', imageUrl: 'https://private.example/anonymous.jpg' })
      .expect(200);

    const persisted = await get<{ id: string }>('SELECT id FROM grading_results WHERE id = ?', [
      'anonymous-result',
    ]);
    expect(persisted).toBeUndefined();
  });
});
