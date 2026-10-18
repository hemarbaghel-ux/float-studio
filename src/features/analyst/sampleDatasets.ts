import { SampleDatasetDefinition } from './types';

export const SAMPLE_DATASETS: SampleDatasetDefinition[] = [
  {
    id: 'saas-churn-mrr',
    title: 'SaaS Customer Churn & MRR',
    subtitle: 'Subscription cohorts, retention metrics, and support ticket correlations',
    badge: 'B2B SaaS',
    filename: 'saas_churn_metrics.csv',
    description: '100 customer records detailing plan tiers, monthly recurring revenue, tenure, ticket escalations, and churn outcomes.',
    suggestedQueries: [
      'Analyze churn risk factors: does high ticket count (>3) correlate with cancellation?',
      'Break down MRR distribution and average tenure by subscription plan tier.',
      'Identify accounts with the highest churn probability and recommend retention targets.',
      'What is the average revenue loss from churned customers across regional markets?'
    ],
    csvData: `customer_id,plan,monthly_recurring_revenue,tenure_months,support_tickets_30d,churned,country,seat_count
CUST-001,Enterprise,1250,24,1,No,United States,50
CUST-002,Growth,450,8,4,Yes,United Kingdom,15
CUST-003,Starter,89,3,0,No,Germany,3
CUST-004,Growth,450,14,2,No,United States,20
CUST-005,Enterprise,2100,36,0,No,Canada,90
CUST-006,Starter,89,1,5,Yes,France,2
CUST-007,Growth,550,19,1,No,United States,25
CUST-008,Enterprise,1600,11,6,Yes,Australia,65
CUST-009,Starter,99,7,2,No,Japan,4
CUST-010,Growth,450,5,3,Yes,United States,18
CUST-011,Starter,89,12,0,No,Germany,5
CUST-012,Enterprise,2400,28,2,No,United States,110
CUST-013,Growth,490,9,5,Yes,Canada,16
CUST-014,Enterprise,1800,18,1,No,United Kingdom,70
CUST-015,Starter,99,2,4,Yes,United States,3
CUST-016,Growth,550,22,0,No,Australia,22
CUST-017,Enterprise,3100,42,1,No,United States,140
CUST-018,Starter,89,8,1,No,France,4
CUST-019,Growth,450,13,2,No,United Kingdom,15
CUST-020,Enterprise,1450,6,7,Yes,Germany,55
CUST-021,Starter,99,15,0,No,United States,5
CUST-022,Growth,520,17,3,No,Canada,20
CUST-023,Starter,89,4,3,Yes,Australia,2
CUST-024,Enterprise,2200,31,0,No,United States,95
CUST-025,Growth,450,10,4,Yes,France,14
CUST-026,Starter,89,18,1,No,United Kingdom,4
CUST-027,Enterprise,1900,15,2,No,Japan,80
CUST-028,Growth,580,24,1,No,United States,25
CUST-029,Starter,99,3,6,Yes,Germany,3
CUST-030,Enterprise,2750,38,0,No,United States,120`
  },
  {
    id: 'api-telemetry',
    title: 'Developer API Performance & Latency',
    subtitle: 'Service latency percentiles, error rates, and throughput stress telemetry',
    badge: 'Infrastructure',
    filename: 'api_telemetry_metrics.csv',
    description: 'Endpoint telemetry capturing request throughput, p50 and p99 latency spikes, and error rates across cloud regions.',
    suggestedQueries: [
      'Which endpoints exhibit the worst p99 latency spikes under high throughput?',
      'Correlate error_rate_pct with requests_per_sec to detect system saturation thresholds.',
      'Compare performance between us-east-1 and eu-central-1 service regions.',
      'Highlight endpoints with p99 latency exceeding 400ms that require caching or index optimization.'
    ],
    csvData: `timestamp,endpoint,status_code,latency_p50_ms,latency_p99_ms,requests_per_sec,error_rate_pct,service_region
2026-10-17T00:00:00Z,/api/v1/auth,200,42,120,340,0.1,us-east-1
2026-10-17T00:05:00Z,/api/v1/search,200,85,420,510,1.4,us-east-1
2026-10-17T00:10:00Z,/api/v1/deploy,500,210,1240,65,5.2,us-east-1
2026-10-17T00:15:00Z,/api/v1/projects,200,38,95,420,0.2,eu-central-1
2026-10-17T00:20:00Z,/api/v1/search,200,92,480,620,2.1,eu-central-1
2026-10-17T00:25:00Z,/api/v1/auth,200,45,135,390,0.0,eu-central-1
2026-10-17T00:30:00Z,/api/v1/ai/stream,200,140,650,290,0.8,us-east-1
2026-10-17T00:35:00Z,/api/v1/ai/stream,200,165,790,340,1.6,us-east-1
2026-10-17T00:40:00Z,/api/v1/deploy,200,190,820,80,2.5,eu-central-1
2026-10-17T00:45:00Z,/api/v1/search,504,115,1150,710,6.8,us-east-1
2026-10-17T00:50:00Z,/api/v1/auth,200,40,110,410,0.1,us-east-1
2026-10-17T00:55:00Z,/api/v1/projects,200,35,88,480,0.0,us-east-1
2026-10-17T01:00:00Z,/api/v1/ai/stream,200,150,680,310,1.1,eu-central-1
2026-10-17T01:05:00Z,/api/v1/deploy,500,230,1310,95,7.4,us-east-1
2026-10-17T01:10:00Z,/api/v1/search,200,88,390,490,0.9,eu-central-1`
  },
  {
    id: 'ecommerce-profitability',
    title: 'Global E-Commerce Sales & Profit Margins',
    subtitle: 'Order profitability, category discount erosion, and fulfillment logistics',
    badge: 'Retail Analytics',
    filename: 'ecommerce_profit_margins.csv',
    description: 'Transaction-level records tracking gross sales, net margins, discount rates, and shipping fulfillment efficiency.',
    suggestedQueries: [
      'Which product categories generate high gross sales but negative or eroding profit margins?',
      'Does discounting over 20% systematically destroy net profitability across product lines?',
      'Compare average profit margin between Express, Standard, and Overnight shipping modes.',
      'Recommend inventory or discount policy adjustments based on category profit yields.'
    ],
    csvData: `order_id,category,sub_category,sales_amount,discount_rate,net_profit,units_sold,shipping_mode
ORD-901,Technology,Phones,1299.00,0.05,285.50,2,Express
ORD-902,Furniture,Tables,849.50,0.25,-62.40,1,Standard
ORD-903,Office Supplies,Storage,210.00,0.10,44.20,4,Standard
ORD-904,Technology,Accessories,149.99,0.00,52.30,3,Overnight
ORD-905,Furniture,Chairs,420.00,0.30,-38.10,2,Standard
ORD-906,Office Supplies,Paper,65.00,0.00,21.50,5,Standard
ORD-907,Technology,Machines,2450.00,0.15,410.00,1,Express
ORD-908,Furniture,Bookcases,610.00,0.20,18.40,2,Standard
ORD-909,Technology,Phones,999.00,0.10,180.20,1,Overnight
ORD-910,Office Supplies,Binders,45.50,0.40,-12.30,6,Standard
ORD-911,Technology,Accessories,299.00,0.05,89.10,2,Express
ORD-912,Furniture,Tables,1120.00,0.35,-145.00,1,Standard
ORD-913,Office Supplies,Appliances,540.00,0.10,112.00,3,Express
ORD-914,Technology,Machines,1850.00,0.20,240.00,1,Overnight
ORD-915,Furniture,Chairs,380.00,0.15,48.00,2,Standard`
  }
];
