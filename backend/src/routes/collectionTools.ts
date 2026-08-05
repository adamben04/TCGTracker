import { Router, Response } from 'express';
import { z } from 'zod';
import { SealedProductService } from '../services/sealedProductService';
import { TransactionService } from '../services/transactionService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';

const router = Router();

const sealedSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    game: z.enum(['pokemon', 'onepiece']).default('pokemon'),
    productType: z.string().min(1),
    setName: z.string().optional(),
    quantity: z.number().int().positive().default(1),
    purchasePrice: z.number().min(0).default(0),
    currentValue: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

const sealedUpdateSchema = z.object({
  body: sealedSchema.shape.body.partial(),
});

const transactionSchema = z.object({
  body: z.object({
    type: z.enum(['buy', 'sell', 'trade_in', 'trade_out']),
    cardId: z.string().optional(),
    cardName: z.string().min(1),
    game: z.enum(['pokemon', 'onepiece']).default('pokemon'),
    quantity: z.number().int().positive().default(1),
    priceEach: z.number().min(0),
    fees: z.number().min(0).optional(),
    transactionDate: z.string().min(1),
    notes: z.string().optional(),
  }),
});

const validateId = z.object({
  params: z.object({ id: z.string().regex(/^\d+$/) }),
});

export const createCollectionToolsRouter = (
  sealedService: SealedProductService,
  transactionService: TransactionService
) => {
  // --- Sealed products ---
  router.get('/sealed', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const items = await sealedService.list(req.user!.id);
      ok(res, { items });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.get('/sealed/stats', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await sealedService.stats(req.user!.id);
      ok(res, { stats });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/sealed', authenticate, validate(sealedSchema), async (req: AuthRequest, res: Response) => {
    try {
      const item = await sealedService.add(req.user!.id, req.body);
      ok(res, { item }, 201);
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.put(
    '/sealed/:id',
    authenticate,
    validate(sealedUpdateSchema),
    validate(validateId),
    async (req: AuthRequest, res: Response) => {
      try {
        await sealedService.update(Number(req.params.id), req.user!.id, req.body);
        const item = await sealedService.getById(Number(req.params.id), req.user!.id);
        if (!item) return fail(res, 'Sealed product not found', 404);
        ok(res, { item });
      } catch (error: any) {
        fail(res, error.message);
      }
    }
  );

  router.delete('/sealed/:id', authenticate, validate(validateId), async (req: AuthRequest, res: Response) => {
    try {
      await sealedService.remove(Number(req.params.id), req.user!.id);
      ok(res, { removed: true });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  // --- Transactions ledger ---
  router.get('/transactions', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const items = await transactionService.list(req.user!.id);
      const summary = await transactionService.summary(req.user!.id);
      ok(res, { items, summary });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.get('/transactions/export', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const csv = await transactionService.exportCsv(req.user!.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="tcg-ledger-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.status(200).send(csv);
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/transactions', authenticate, validate(transactionSchema), async (req: AuthRequest, res: Response) => {
    try {
      const item = await transactionService.add(req.user!.id, req.body);
      const summary = await transactionService.summary(req.user!.id);
      ok(res, { item, summary }, 201);
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.delete('/transactions/:id', authenticate, validate(validateId), async (req: AuthRequest, res: Response) => {
    try {
      await transactionService.remove(Number(req.params.id), req.user!.id);
      const summary = await transactionService.summary(req.user!.id);
      ok(res, { removed: true, summary });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  return router;
};
