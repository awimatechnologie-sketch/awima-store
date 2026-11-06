import { postLike } from '../../server/handlers.js';
export const onRequestPost = ({ request, env }) => postLike(request, env);
