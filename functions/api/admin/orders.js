import { adminOrders, adminOrderStatus } from '../../../server/handlers.js';
export const onRequestGet = ({ request, env }) => adminOrders(request, env);
export const onRequestPost = ({ request, env }) => adminOrderStatus(request, env);
