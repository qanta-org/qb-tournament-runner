import { Router } from 'express';
import type { CreateTournamentParams } from '../../shared/types.js';
import { tournamentManager } from '../game/tournaments.js';

export const tournamentsRouter = Router();

/**
 * @swagger
 * /api/tournaments/list:
 *   get:
 *     summary: List active tournaments
 *     tags: [Tournaments]
 *     responses:
 *       200:
 *         description: List of tournaments
 */
tournamentsRouter.get('/list', (_req, res) => {
  const tournaments = tournamentManager.listTournaments();
  res.json({ tournaments });
});

/**
 * @swagger
 * /api/tournaments/{code}:
 *   get:
 *     summary: Get tournament by code
 *     tags: [Tournaments]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tournament details
 *       404:
 *         description: Tournament not found
 */
tournamentsRouter.get('/:code', (req, res) => {
  const { code } = req.params;
  const tournament = tournamentManager.getTournament(code);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found', code });
  }
  res.json(tournament);
});

/**
 * @swagger
 * /api/tournaments:
 *   post:
 *     summary: Create a tournament
 *     tags: [Tournaments]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Tournament created
 *       400:
 *         description: Invalid parameters
 */
tournamentsRouter.post('/', (req, res) => {
  try {
    const params = req.body as CreateTournamentParams;
    const createdBy = (req as any).socketId ?? 'rest';

    if (!params.name || !params.format || !params.datasetId || !params.teams || !params.packets || !params.modelDirectory) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['name', 'format', 'datasetId', 'teams', 'packets', 'modelDirectory'],
      });
    }

    const tournament = tournamentManager.createTournament(params, createdBy);
    res.json({ code: tournament.code, tournament });
  } catch (err) {
    console.error('Create tournament error:', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to create tournament',
    });
  }
});
