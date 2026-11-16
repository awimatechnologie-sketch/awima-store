import { postMiss } from '../../server/handlers.js';
export const onRequestPost = ({ request, env }) => postMiss(request, env);
