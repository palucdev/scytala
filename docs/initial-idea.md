## Scytala - MVP

### Main Problem

Sharing private hypermedia like texts, photos, videos, surveys, files, code etc is problematic using current platforms because they mainly use chat interface which tends to be hard to search and navigate. Also there are always security and privacy concerns regarding 3rd party services. That's why the Scytala is designed to be a self hosted platform for sharing private content with chosen people, in a secure and user friendly way.

### Minimum Feature Set

- Dashboard with notes, files and other media content presented as readable tiles
- Manual note creation
- Editing and deleting the notes
- Sharing (one-to-one or one-to-many) dashboard via secure link
- Login screen where users provide their IDs and passwords for authetication
- New dashboard creator wizard that allows you to create a new dashboard with a title, description and users credentials
- User credential generation: manual ID + randomized strong password
- Editing and deleting dashboards for dashboard owner
- Notes are timestamped, have history of changes and are editable by all users with access to the dashboard
- Dashboards should synchronize at the enter and have a manual button for synchronization

### What is NOT in the scope of MVP

- Additional features like file sharing, photos sharing etc
- AI integration
- Integration with other applications
- Mobile app (web application needed for MVP)
- Support for custom text formats like Markdown, HTML, etc (plain text only for MVP)
- Custom themes and styling
- No permissions management - all users are owners
- No changing of the user IDs and passwords - they should be set only once at the dashboard creator

### Success Metrics

- User can create a dashboard, set the users, become owner and share the dashboard
- Users can login, view the dashboard content and edit notes
- Users can manually sync the dashboard to get newest changes
