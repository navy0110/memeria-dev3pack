import { ES_DATA } from './es-data';
import { ES_QUESTS } from './es-quests';
import { ES_UI } from './es-ui';

export const ES: Record<string, string> = { ...ES_UI, ...ES_DATA, ...ES_QUESTS };
