module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-contrib-concat');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    meta: {
      banner: 
        '/*\n' +
        ' * angular-burn, v<%=pkg.version%>\n' +
        ' * Andy Joslin, MIT License\n' +
        ' * http://github.com/ajoslin/angular-burn\n' +
        ' */\n' +
        '(function() {\n',
      footer: '}());'
    },
    concat: {
      options: {
        banner: '<%= meta.banner %>',
        footer: '<%= meta.footer %>'
      },
      dist: {
        files: {
          'angular-burn.js': ['src/*.js', '!src/*.spec.js']
        }
      }
    }
  });
  grunt.registerTask('default', 'concat');
};
