export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        // URLs and agent-generated metadata in commit bodies can exceed 100 chars.
        // Disable the body line-length limit; the subject-line limit (100) still applies.
        'body-max-line-length': [0, 'always', Infinity],
    },
};
