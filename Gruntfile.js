module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON('bower.json'),
    meta: {
      banner: 
        '/*\n' +
        ' * angular-burn, v<%=pkg.version%>\n' +
        ' * Andy Joslin, MIT License\n' +
        ' * http://github.com/ajoslin/angular-burn\n' +
        ' */\n' +
        '(function() {\n',
      footer: '\n}());'
    },
    shell: {
      release: {
        options: {
          stdout: true,
          stderr: true
        },
        command: [
          'grunt concat',
          'mv dist/angular-burn.js .',
          'git tag v<%= pkg.version %>',
          'grunt changelog',
          'git commit CHANGELOG.md bower.json angular-burn.js -am "release: v<%= pkg.version %>"'
        ].join(' && ')
      }
    },
    changelog: {
      options: {
        dest: 'CHANGELOG.md'
      }
    },
    concat: {
      options: {
        banner: '<%= meta.banner %>',
        footer: '<%= meta.footer %>'
      },
      dist: {
        files: {
          'dist/angular-burn.js': ['src/*.js', '!src/*.spec.js']
        }
      }
    }
  });
  grunt.registerTask('default', 'concat');
};
