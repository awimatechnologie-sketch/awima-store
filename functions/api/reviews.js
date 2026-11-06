import { getReviews, postReview } from '../../server/handlers.js';
export const onRequestGet = ({ request, env }) => getReviews(request, env);
export const onRequestPost = ({ request, env }) => postReview(request, env);
