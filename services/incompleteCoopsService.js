import { listIncompleteCoops } from '../utils/database/incompleteCoopsRepository.js';

export function fetchIncompleteCoops() {
  return listIncompleteCoops();
}

export default { fetchIncompleteCoops };
