import { adminList, adminAct } from '../../../server/handlers.js';
export const onRequestGet = ({ request, env }) => adminList(request, env);
export const onRequestPost = ({ request, env }) => adminAct(request, env);
