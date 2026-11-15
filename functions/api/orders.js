import { postOrder } from '../../server/handlers.js';
export const onRequestPost = ({ request, env }) => postOrder(request, env);
