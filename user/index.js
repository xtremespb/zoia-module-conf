import article from './article';

export default fastify => { // fastify
    fastify.get('/', article(fastify));
    fastify.get('/:language', article(fastify));
};
