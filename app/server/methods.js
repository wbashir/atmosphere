Meteor.methods({
  publish: function(pkgInfo) {

    Logs.insert({
      name: 'method.publish',
      userId: Meteor.userId(),
      pkgInfo: pkgInfo,
      stamp: new Date()
    });

    var pkgRecord = Packages.findOne({ name: pkgInfo.name });
    
    pkgInfo.author = _.parseAuthor(pkgInfo.author);

    var versionFormat = /^\d{1,3}\.\d{1,3}\.\d{1,3}[\.\d\w]*$/;

    var errors = _.validate(pkgInfo, [

      // Name
      _.presenceOf   ('name'),
      _.lengthOf     ('name', { gte: 1, lte: 30 }),

      // Description
      _.presenceOf   ('description'),
      _.lengthOf     ('description', { gte: 20, lte: 500 }),

      // Homepage
      _.presenceOf   ('homepage'),
      _.validUrl     ('homepage'),

      // Author name
      _.presenceOf   ('author.name'),
      _.lengthOf     ('author.name', { gte: 5, lte: 50 }),

      // Author email
      _.validEmail   ('author.email'),

      // Author url
      _.validUrl     ('author.url'),

      // Version
      _.presenceOf   ('version'),
      _.formatOf     ('version', versionFormat, 'must be correctly formatted (e.g. 0.0.3, 0.0.4rc1, etc)'),

      // Git url
      _.presenceOf   ('git'),
      _.validUrl     ('git')

    ]);

    var errorMessages = _.flatErrors(errors);

    if (errorMessages.length > 0)
      throw new Meteor.Error(422, "Package could not be saved", errorMessages);

    var packageFields = [
      'name',
      'description',
      'homepage',
      'author',
      'version',
      'git',
      'packages',
      'visible',
      'meteor'
    ];

    // these are the fields that get saved to each version
    var versionFields = [
      'git',
      'version',
      'meteor',
      'packages',
      'createdAt'
    ];
    
    var updatePackage = function(oldPkg, newPkg) {
      return _.each(packageFields, function(key) {
        if (key !== 'packages')
          oldPkg[key] = newPkg[key];
      });
    };

    // Get rid of keys we don't want
    pkgInfo = _.pick(pkgInfo, packageFields);

    // Setup defaults
    pkgInfo.visible = _.isUndefined(pkgInfo.visible) ? true : pkgInfo.visible;
    
    // prepare version
    var now = new Date().getTime();
    var versionRecord = _.pick(pkgInfo, versionFields);
    versionRecord.createdAt = now;
    versionRecord.updatedAt = now;
    
    // Ok we have one
    if (pkgRecord) {

      // Only the owner can update it
      if (pkgRecord.userId !== Meteor.userId())
        throw new Meteor.Error(401, "That ain't yr package son!");

      // Add new version
      pkgRecord.versions.push(versionRecord);

      // Assign packages
      if (pkgInfo.packages)
        pkgRecord.packages = pkgInfo.packages;

      // Timestamp it
      if (pkgInfo.version > pkgRecord.latest)
        pkgRecord.updatedAt = new Date().getTime();

      pkgRecord.latest = pkgInfo.version;

      updatePackage(pkgRecord, pkgInfo);
      
      // Get the update ID first
      var id = pkgRecord._id;

      Notify.send('package', 'update', pkgRecord);

      // Do the update
      Packages.update(id, {
        $set: _.removeId(pkgRecord)
      });
    } else {

      var errors = _.validate(pkgInfo, [
        // Name
        _.uniquenessOf ('name', { in: Packages }),
      ]);

      var errorMessages = _.flatErrors(errors);

      if (errorMessages.length > 0)
        throw new Meteor.Error(422, "Package could not be saved", errorMessages);

      // Setup new package record
      var newPackage = _.extend(pkgInfo, {
        userId: Meteor.userId(),
        latest: pkgInfo.version,
        createdAt: now,
        updatedAt: now,
        versions: [versionRecord]
      });

      Notify.send('package', 'new', newPackage);

      // Insert it
      Packages.insert(newPackage);
    }
  },
  getReadMe:function(packageName) {
    console.log("GET"+packageName);
    var package = Packages.findOne({name:packageName});
    
    if(package) {
      var github_data = /\/\/github\.com\/([\w]+)\/([\w-_\.]+)\.git/i.exec(package.git);
      
      if(github_data) {
        var repo_owner = github_data[1];
        var repo_name = github_data[2];
        //var url = "https://api.github.com/repos/"+repo_owner+"/"+repo_name+"/readme";
        var url = "http://raw.github.com/"+repo_owner+"/" + repo_name + "/master/README.md";
        
        try {
          var result = Meteor.http.get(url,{headers:{"User-Agent":"Meteor Community Repository Bot"}});
        }
        catch(err) {
          return false;
        }
        
        if(result.statusCode != 200) return false;
        return result.content;  
      }
      else
      {
        return false;
      }
    }
    else
    {
      return false;
    }
  }
});
