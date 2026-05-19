// DassaAI Worker — entry point
//
// Imports all job workers to register them. Each worker connects to its
// BullMQ queue and processes jobs as they arrive.
//
// To add a new job type:
//   1. Create the handler in ./jobs/
//   2. Import it here

import './jobs/orderProcessor';
import './jobs/trackingUpdater';
import './jobs/notifier';
import './jobs/sellerCampaign';

console.log('[Worker] All job handlers registered and listening');
