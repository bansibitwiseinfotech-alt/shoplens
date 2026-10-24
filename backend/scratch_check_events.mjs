import 'dotenv/config';
import connectDB from './config/db.js';
import SearchEvent from './models/searchEvent.model.js';

async function check() {
  await connectDB();
  const evts = await SearchEvent.aggregate([
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } },
          type: '$eventType',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);
  console.log(JSON.stringify(evts, null, 2));
  process.exit(0);
}

check();
