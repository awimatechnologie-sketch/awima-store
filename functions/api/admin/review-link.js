import { adminLink } from '../../../server/handlers.js';
export const onRequestPost = ({ request, env }) => adminLink(request, env);
