import apiConfPublish from './apiConfPublish';

export default fastify => {
    fastify.post('/api/conf/publishArticle', apiConfPublish(fastify));
};
