import { getCommunity } from '../../server/handlers.js';
export const onRequestGet = ({ request, env }) => getCommunity(request, env);
