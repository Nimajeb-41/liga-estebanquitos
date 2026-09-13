/** Relaciones para el query builder de Drizzle. */

import { relations } from 'drizzle-orm';

import { adminSessions, adminUsers } from './admin.ts';
import { cards, deckCards, decks } from './decks.ts';
import { fixtureGenerations, matches, rounds } from './fixture.ts';
import { players } from './players.ts';
import { matchResultReports, matchResultRevisions, matchResults } from './results.ts';
import { sanctions } from './sanctions.ts';
import { matchPostponements } from './schedule.ts';
import { tournaments, tournamentSettings } from './tournaments.ts';

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  settings: one(tournamentSettings, {
    fields: [tournaments.id],
    references: [tournamentSettings.tournamentId],
  }),
  players: many(players),
  rounds: many(rounds),
  matches: many(matches),
  sanctions: many(sanctions),
  fixtureGenerations: many(fixtureGenerations),
}));

export const tournamentSettingsRelations = relations(tournamentSettings, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentSettings.tournamentId],
    references: [tournaments.id],
  }),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [players.tournamentId],
    references: [tournaments.id],
  }),
  replacedBy: one(players, {
    fields: [players.replacedByPlayerId],
    references: [players.id],
    relationName: 'playerReplacement',
  }),
  homeMatches: many(matches, { relationName: 'homePlayer' }),
  awayMatches: many(matches, { relationName: 'awayPlayer' }),
  sanctions: many(sanctions),
  decks: many(decks),
}));

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [rounds.tournamentId],
    references: [tournaments.id],
  }),
  matches: many(matches),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [matches.tournamentId],
    references: [tournaments.id],
  }),
  round: one(rounds, {
    fields: [matches.roundId],
    references: [rounds.id],
  }),
  homePlayer: one(players, {
    fields: [matches.homePlayerId],
    references: [players.id],
    relationName: 'homePlayer',
  }),
  awayPlayer: one(players, {
    fields: [matches.awayPlayerId],
    references: [players.id],
    relationName: 'awayPlayer',
  }),
  result: one(matchResults, {
    fields: [matches.id],
    references: [matchResults.matchId],
  }),
  revisions: many(matchResultRevisions),
  reports: many(matchResultReports),
  postponements: many(matchPostponements),
  decks: many(decks),
  sanctions: many(sanctions),
}));

export const matchPostponementsRelations = relations(matchPostponements, ({ one }) => ({
  match: one(matches, {
    fields: [matchPostponements.matchId],
    references: [matches.id],
  }),
  admin: one(adminUsers, {
    fields: [matchPostponements.adminId],
    references: [adminUsers.id],
  }),
}));

export const matchResultReportsRelations = relations(matchResultReports, ({ one }) => ({
  match: one(matches, {
    fields: [matchResultReports.matchId],
    references: [matches.id],
  }),
  player: one(players, {
    fields: [matchResultReports.playerId],
    references: [players.id],
  }),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  admin: one(adminUsers, {
    fields: [adminSessions.adminId],
    references: [adminUsers.id],
  }),
}));

export const matchResultsRelations = relations(matchResults, ({ one }) => ({
  match: one(matches, {
    fields: [matchResults.matchId],
    references: [matches.id],
  }),
  reportedBy: one(players, {
    fields: [matchResults.reportedByPlayerId],
    references: [players.id],
  }),
  verifiedBy: one(adminUsers, {
    fields: [matchResults.verifiedByAdminId],
    references: [adminUsers.id],
  }),
}));

export const matchResultRevisionsRelations = relations(matchResultRevisions, ({ one }) => ({
  match: one(matches, {
    fields: [matchResultRevisions.matchId],
    references: [matches.id],
  }),
  changedBy: one(adminUsers, {
    fields: [matchResultRevisions.changedByAdminId],
    references: [adminUsers.id],
  }),
}));

export const sanctionsRelations = relations(sanctions, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [sanctions.tournamentId],
    references: [tournaments.id],
  }),
  player: one(players, {
    fields: [sanctions.playerId],
    references: [players.id],
  }),
  match: one(matches, {
    fields: [sanctions.matchId],
    references: [matches.id],
  }),
  issuedBy: one(adminUsers, {
    fields: [sanctions.issuedByAdminId],
    references: [adminUsers.id],
  }),
}));

export const decksRelations = relations(decks, ({ one, many }) => ({
  player: one(players, {
    fields: [decks.playerId],
    references: [players.id],
  }),
  match: one(matches, {
    fields: [decks.matchId],
    references: [matches.id],
  }),
  cards: many(deckCards),
}));

export const deckCardsRelations = relations(deckCards, ({ one }) => ({
  deck: one(decks, {
    fields: [deckCards.deckId],
    references: [decks.id],
  }),
  card: one(cards, {
    fields: [deckCards.cardId],
    references: [cards.id],
  }),
}));

export const fixtureGenerationsRelations = relations(fixtureGenerations, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [fixtureGenerations.tournamentId],
    references: [tournaments.id],
  }),
  generatedBy: one(adminUsers, {
    fields: [fixtureGenerations.generatedByAdminId],
    references: [adminUsers.id],
  }),
}));
