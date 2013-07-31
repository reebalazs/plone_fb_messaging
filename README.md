
# plone_fb_messaging #

A messaging application to demonstrate interactivity brought to Plone via the technologies of [AngularJS](http://angularjs.org) and [FireBase](http://firebase.com).


## Installation ##

The package can be installed in the same way as Plone packages are usually installed.

After the installation, the `plone_fb_messaging` package has to be installed from `Site Setup / Add Packages`.


### Buildout example ###

There is an example buildout configuration in the package that can be alternately used to install the package with the Plone 4.3 version. You can also use the buildout as a starting point for your own site setup. However, using the provided configuration is not required, the package can just be installed as an egg.


## Setup ##

Additional setup steps are needed following the installation.


### Customizing Plone ###

The package must be customized from the ZMI from the site_properties tool. Visit `site_properties/firebase_properties` from the ZMI and set the following properties:

- **firebase_url:** The url of the firebase data.

- **firebase_secret:** Your firebase secret.

- **filter_users**: Enable/disable filtering of users who can access the service.

- **allowed_users**: List users who can access the service (if `filter_users==True`)


#### firebase_url

The url of the firebase data.

For example:

    https://my-firebase.firebaseio.com/collective_firebase


You can use the same firebase for more applications. You can specify an arbitrary path prefix to your database which at this point does not need to exist yet, but it is important that the url designates a path in the database that does not overlap with your other applications:

    https://my-firebase.firebaseio.com/COMPANY/PROJECT/SITE/collective_firebase

If this property is left empty, the value of the `PLONE_COLLECTIVE_FIREBASE_URL` environment variable will be used as a default.


#### firebase_secret

Your firebase secret as provided by the Firebase application (Forge).

Keep the secret confidential, because if you give this secret to anyone, you grant full access to your entire database. If needed, you can generate more secrets, which gives you better control over them.

If this property is left empty, the value of the `PLONE_COLLECTIVE_FIREBASE_SECRET` environment variable will be used as a default.


### Alternate way: customize via enviromnent variables ###

As mentioned above, the `firebase_url` and `firebase_secret` properties can also be specified from environment variables:

    % export PLONE_FIREBASE_SECRET='ZsAjg**********...'
    % export PLONE_FIREBASE_URL='https://my-firebase.firebaseio.com/...'

If these values exist, they serve as a default value and the property fields in site_properties can be left empty. If the properties are also specified, they will take precedence over the environment variables.


### Customize Firebase ###

You must set up FireBase manually from your firebases' administration site. You find this page from the firebase web management interface.

DOUBLE WARNING: If you fail to do this, then anyone will be able to fully access your data. This is due to firebase's defaults. You may not notice if this is happening, so please take extra care at this step.


#### Auth tab

Since we are using custom authentication, you must add the domain or ip of the site that runs the Plone server into `Authorized Request Origins`. Without this Firebase will reject access to the database.

On the same page, you can find the firebase authentication tokens and can add or revoke them as needed.


#### Permissions tab

XXX
 


#### Data creation

There is no need to create any data in Firebase as the data will be created on the first client write.


## Using the UI from Plone ##

XXX


## Development ##

You only need to read this if you plan on authoring the third party JavaScript and CSS resources that this package is dependent on.

All JS resources are defined as Plone javascript resources with Resource Registries.

Except, `firebase.js` is coming from a CDN, because it seems that this is the supported way of using it, and there is no packaged release available.

The external sources are not contained in this package. Installation of 3rd party packages is automated, and the production artifacts are placed in the `static/dist` directory. You only need any of the following if you want to regenerate this artifacts based on the original sources.

To do the regeneration, you need to have `node` and `npm` installed on your computer. Following that you can perform the installation:

    $ npm install .
    $ bower install

and after that you can regenerate the resources:

    $ grunt

or, start a watch to rebuild the resources if any of the sources changes:

    $ grunt watch

If you prefer to use the example buildout, you can do the same by the following commands, provided that you have a working `npm` installed:

    $ bin/buildout
    $ bin/grunt

The buildout is simply a commodity to make sure that the steps are correctly automated. If you are familiar with `npm`, `bower` and `grunt`, you may want to just use them directly without the buildout, since it will lead to the same results.
