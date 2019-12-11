import fs from 'fs-extra';
import {
    slugify
} from 'transliteration';
import truncate from 'underscore.string/truncate';
import capitalize from 'underscore.string/capitalize';
import path from 'path';
import locale from '../../../shared/lib/locale';
import mailer from '../../../shared/lib/email';
import mailArticle from '../email/article/index.marko';
import auth from '../../../shared/lib/auth';
import I18N from '../../../shared/utils/i18n-node';
import textProcessor from '../utils/textProcessor';

let config;
try {
    config = fs.readJSONSync(path.resolve(`${__dirname}/../etc/conf.json`));
} catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
    process.exit(1);
}

export default fastify => ({
    schema: {
        body: {
            type: 'object',
            properties: {
                firstName: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 50
                },
                middleName: {
                    type: 'string',
                    maxLength: 50
                },
                lastName: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 50
                },
                firstNameCo: {
                    type: 'string',
                    maxLength: 50
                },
                middleNameCo: {
                    type: 'string',
                    maxLength: 50
                },
                lastNameCo: {
                    type: 'string',
                    maxLength: 50
                },
                articleTitle: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 250
                },
                articleContent: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 100000
                },
                articleBibliography: {
                    type: 'string',
                    maxLength: 10000
                },
                captcha: {
                    type: 'string',
                    minLength: 4,
                    maxLength: 4,
                    pattern: '^[0-9]+$'
                },
                captchaSecret: {
                    type: 'string',
                    maxLength: 2048
                },
                language: {
                    type: 'string',
                    maxLength: 2,
                    minLength: 2,
                    pattern: '^[a-z]+$'
                }
            },
            required: ['firstName', 'lastName', 'articleTitle', 'articleContent', 'captcha', 'captchaSecret', 'language']
        }
    },
    attachValidation: true,
    async handler(req, rep) {
        // Start of Validation
        if (!Object.keys(fastify.zoiaConfig.languages).find(i => i === req.body.language)) {
            req.validationError = {
                message: 'Invalid language'
            };
        }
        if (req.validationError) {
            req.log.error({
                ip: req.ip,
                path: req.urlData().path,
                query: req.urlData().query,
                error: req.validationError.message
            });
            return rep.code(400).send(JSON.stringify(req.validationError));
        }
        // End of Validation
        // Processing
        try {
            // Load locale
            const i18n = I18N('conf')[req.body.language];
            // Check captcha
            if (!await auth.validateCaptcha(req.body.captchaSecret, req.body.captcha, fastify, this.mongo.db)) {
                return rep.code(200)
                    .send(JSON.stringify({
                        statusCode: 400,
                        errorCode: 1,
                        message: 'Invalid Captcha',
                        errors: {
                            default: {
                                captcha: ''
                            }
                        }
                    }));
            }
            // Prepare article data
            const lastName = `${req.body.lastName.charAt(0).toUpperCase()}${req.body.lastName.slice(1)}`;
            const fullName = textProcessor.processAuthor(`${lastName} ${req.body.firstName[0].toUpperCase()}.${req.body.middleName ? `${req.body.middleName[0].toUpperCase()}.` : ''}`);
            const name3p = textProcessor.processAuthor(`${capitalize(lastName)} ${capitalize(req.body.firstName)} ${req.body.middleName ? capitalize(req.body.middleName) : ''}`);
            let fullNameCo = '';
            let nameCo3p = '';
            if (req.body.lastNameCo) {
                const lastNameCo = `${req.body.lastNameCo.charAt(0).toUpperCase()}${req.body.lastNameCo.slice(1)}`;
                fullNameCo = textProcessor.processAuthor(`, ${lastNameCo} ${req.body.firstNameCo[0].toUpperCase()}.${req.body.middleNameCo ? `${req.body.middleNameCo[0].toUpperCase()}.` : null}`);
                nameCo3p = textProcessor.processAuthor(`${capitalize(lastNameCo)} ${capitalize(req.body.firstNameCo)} ${req.body.middleNameCo ? capitalize(req.body.middleNameCo) : ''}`);
            }
            const title = textProcessor.processTitle(req.body.articleTitle);
            const content = textProcessor.processArticle(req.body.articleContent).replace(/<br\/>/gm, '\n');
            const bibliography = textProcessor.processBibliography(req.body.articleBibliography, content).replace(/<br\/>/gm, '\n');
            const bibliographyHeader = bibliography ? 'Литература' : '';
            const articleData = {
                name3p,
                nameCo3p,
                fullName,
                fullNameCo,
                title,
                content,
                bibliography,
                bibliographyHeader
            };
            articleData.charsCount = textProcessor.countChars(articleData);
            articleData.cost = parseInt(articleData.charsCount * config.costPerChar, 10);
            const fileContent = `${fullName}${fullNameCo}\n${title}\n${content}\n${bibliographyHeader}\n${bibliography}`;
            // Save article to disk
            const filename = `${truncate(slugify(lastName).replace(/[^a-z]/ig, ''), 20, '')}_${parseInt(new Date().getTime() / 1000, 10)}.txt`;
            await fs.writeFile(`${__dirname}/../static/conf/${filename}`, fileContent);
            // Prepare and send mail
            const prefix = locale.getPrefixForLanguage(req.body.language, fastify);
            const subj = 'New article publication request';
            const render = (await mailArticle.render({
                $global: {
                    siteURL: `${fastify.zoiaConfig.siteURL}${prefix}` || '',
                    siteTitle: fastify.zoiaConfig.siteTitle[req.body.language] || '',
                    title: i18n[subj],
                    preheader: i18n[subj],
                    t: i18n,
                    articleData,
                    config
                }
            }));
            const htmlMail = render.out.stream.str;
            const attachments = [{
                filename,
                content: Buffer.from(fileContent, 'utf-8')
            }];
            await mailer.sendMail(config.email, i18n[subj], htmlMail, '', req.body.language, attachments, fastify);
            // Send response
            return rep.code(200)
                .send(JSON.stringify({
                    statusCode: 200
                }));
        } catch (e) {
            req.log.error({
                ip: req.ip,
                path: req.urlData().path,
                query: req.urlData().query,
                error: e && e.message ? e.message : 'Internal Server Error',
                stack: fastify.zoiaConfigSecure.stackTrace && e.stack ? e.stack : null
            });
            return rep.code(500).send(JSON.stringify({
                statusCode: 500,
                error: 'Internal server error',
                message: e && e.message ? e.message : null
            }));
        }
    }
});
