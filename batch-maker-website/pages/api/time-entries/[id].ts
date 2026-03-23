// pages/api/time-entries/[id].ts
// Handles PATCH (edit) and DELETE for a single time entry.
// id comes from the dynamic segment: req.query.id

import type { NextApiRequest, NextApiResponse } from 'next';
import { editTimeEntry, deleteTimeEntry } from '../timeEntries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'PATCH':
    case 'PUT':
      return editTimeEntry(req, res);
    case 'DELETE':
      return deleteTimeEntry(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}