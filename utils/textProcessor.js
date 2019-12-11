import stripTags from 'underscore.string/stripTags';
import clean from 'underscore.string/clean';
import lines from 'underscore.string/lines';
import join from 'underscore.string/join';
import unescapeHTML from 'underscore.string/unescapeHTML';
import Typograf from 'typograf';

const typograf = new Typograf({
    locale: 'ru'
});

export default {
    countChars: data => join('', data.fullName,
        data.fullNameCo,
        data.title,
        data.content,
        data.bibliography,
        data.bibliographyHeader).replace(/[\s\r\n\t]+/gm, '').length,
    processAuthor: text => clean(stripTags(text)),
    processTitle: text => unescapeHTML(typograf.execute(clean(stripTags(text)))),
    processArticle: text => {
        const linesArr = lines(text);
        const linesArrProcessed = linesArr.map(line => clean(stripTags(line))).filter(line => line && line.length);
        return unescapeHTML(typograf.execute(linesArrProcessed.join('<br/>')));
    },
    processBibliography: (biblio, article) => {
        const linesArr = lines(biblio);
        const linesArrProcessed = linesArr.map((line, i) => `${line.length && !line[0].match(/[0-9]/) ? `${i + 1}. ` : ''}${stripTags(clean(line))}`).filter(line => line && line.length);
        const errors = article ? linesArr.map(n => {
            const [i] = n.split(/\./);
            const rx = new RegExp(`\\[${i},`);
            return article.match(rx) ? null : n;
        }).filter(i => i) : null;
        return errors && errors.length ? errors : unescapeHTML(typograf.execute(linesArrProcessed.join('<br/>')));
    },
};
