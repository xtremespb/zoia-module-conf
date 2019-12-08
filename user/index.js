import article from './article';

export default fastify => { // fastify
    fastify.get('/article', article(fastify));
    fastify.get('/:language/article', article(fastify));
};
