import { taskmarketConnector } from './server/connectors/taskmarket.ts';
const t = await taskmarketConnector.discover({ platformId: 2, platformSlug: 'taskmarket', baseUrl: '' });
console.log('total', t.length, 'eligible', t.filter((x) => x.eligibility === 'eligible').length);
console.log(JSON.stringify(t.slice(0, 4).map((x) => ({ id: x.externalId.slice(0, 10), title: x.title.slice(0, 50), reward: x.reward, deadline: x.deadline, mode: x.category, eligibility: x.eligibility, why: x.eligibilityReasons })), null, 1));
