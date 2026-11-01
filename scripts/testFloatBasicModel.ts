import { INITIAL_MODELS } from '../src/features/ai/registry';
import { ModelRouter } from '../src/server/providers/router';

const expectedIds = ['gpt-6-astra', 'gpt-6.1-sol'];
const selectableIds = INITIAL_MODELS.map((model) => model.id).sort();
const serverSelectableIds = new ModelRouter().getModelCatalog().map((model) => model.id).sort();

if (JSON.stringify(selectableIds) !== JSON.stringify(expectedIds)) {
  throw new Error(`Client model selector must contain only ${expectedIds.join(', ')}; got ${selectableIds.join(', ')}`);
}
if (JSON.stringify(serverSelectableIds) !== JSON.stringify(expectedIds)) {
  throw new Error(`Server model catalog must contain only ${expectedIds.join(', ')}; got ${serverSelectableIds.join(', ')}`);
}
console.log('Selectable model catalog: GPT-6 Astra and GPT-6.1 Sol only.');
